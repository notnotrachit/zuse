import { execFile, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { scrubInheritedClaudeMarkers } from "@zuse/agents/drivers/claude-env";
import type {
	AccountAccessCustomConfigRequest,
	AccountAccessProvider,
	AccountAccessSetCredentialRequest,
	AccountAccessTransferEvent,
} from "@zuse/contracts";
import {
	AccountAccessProviderStatus,
	AccountAccessStatus,
} from "@zuse/contracts";
import { Cause, Context, Effect, Layer, Queue, Stream } from "effect";

import { AppPaths } from "../app-paths.ts";
import { MachineRuntimeRole } from "../machine/machine-runtime-role.ts";
import { CredentialsService } from "../provider/services/credentials-service.ts";
import {
	getAccountAccessLoginCommand,
	parseDeviceLoginVerification,
	redactAccountAccessOutput,
} from "./adapters.ts";
import { AccountAccessServiceError } from "./errors.ts";

const execFileAsync = promisify(execFile);
const MAX_SECRET_BYTES = 32_768;
const PROVIDERS = ["claude", "codex", "cursor", "grok"] as const;

export type AccountAccessProcessEvent =
	| { readonly _tag: "line"; readonly text: string }
	| { readonly _tag: "exit"; readonly code: number };

export interface AccountAccessProcessShape {
	readonly capture: (
		command: string,
		args: ReadonlyArray<string>,
		environment?: Readonly<Record<string, string>>,
	) => Effect.Effect<
		{ readonly stdout: string; readonly stderr: string; readonly code: number },
		AccountAccessServiceError
	>;
	readonly stream: (
		command: string,
		args: ReadonlyArray<string>,
		environment?: Readonly<Record<string, string>>,
	) => Stream.Stream<AccountAccessProcessEvent, AccountAccessServiceError>;
	readonly input: (
		command: string,
		args: ReadonlyArray<string>,
		input: string,
	) => Effect.Effect<number, AccountAccessServiceError>;
}

export class AccountAccessProcess extends Context.Service<
	AccountAccessProcess,
	AccountAccessProcessShape
>()("zuse/AccountAccessProcess") {}

const captureProcess: AccountAccessProcessShape["capture"] = (
	command,
	args,
	environment,
) =>
	Effect.tryPromise({
		try: async () => {
			try {
				const result = await execFileAsync(command, [...args], {
					cwd: homedir(),
					env: processEnvironment(environment),
					timeout: 30_000,
					maxBuffer: 256 * 1_024,
				});
				return { stdout: result.stdout, stderr: result.stderr, code: 0 };
			} catch (cause) {
				const failure = cause as {
					stdout?: string;
					stderr?: string;
					code?: number | string;
				};
				if (typeof failure.code === "number") {
					return {
						stdout: failure.stdout ?? "",
						stderr: failure.stderr ?? "",
						code: failure.code,
					};
				}
				throw cause;
			}
		},
		catch: () => new AccountAccessServiceError("tool-not-installed"),
	});

const processEnvironment = (
	overrides: Readonly<Record<string, string>> | undefined,
): NodeJS.ProcessEnv => ({
	...scrubInheritedClaudeMarkers(process.env),
	...overrides,
});

const streamProcess: AccountAccessProcessShape["stream"] = (
	command,
	args,
	environment,
) =>
	Stream.callback<AccountAccessProcessEvent, AccountAccessServiceError>(
		(queue) =>
			Effect.gen(function* () {
				const child = spawn(command, [...args], {
					cwd: homedir(),
					env: processEnvironment(environment),
					stdio: ["ignore", "pipe", "pipe"],
				});
				let completed = false;
				const emit = (chunk: Buffer | string): void => {
					for (const text of chunk.toString().split(/\r?\n/u)) {
						if (text.trim().length > 0) {
							Queue.offerUnsafe(queue, { _tag: "line", text });
						}
					}
				};
				child.stdout.on("data", emit);
				child.stderr.on("data", emit);
				child.once("error", () => {
					completed = true;
					Queue.failCauseUnsafe(
						queue,
						Cause.fail(new AccountAccessServiceError("tool-not-installed")),
					);
				});
				child.once("exit", (code) => {
					completed = true;
					Queue.offerUnsafe(queue, { _tag: "exit", code: code ?? 1 });
					Queue.endUnsafe(queue);
				});
				yield* Effect.addFinalizer(() =>
					Effect.sync(() => {
						if (!completed) child.kill("SIGTERM");
					}),
				);
			}),
	);

const inputProcess: AccountAccessProcessShape["input"] = (
	command,
	args,
	input,
) =>
	Effect.callback<number, AccountAccessServiceError>((resume) => {
		const child = spawn(command, [...args], {
			cwd: homedir(),
			env: processEnvironment(undefined),
			stdio: ["pipe", "ignore", "ignore"],
		});
		child.once("error", () =>
			resume(Effect.fail(new AccountAccessServiceError("tool-not-installed"))),
		);
		child.once("exit", (code) => resume(Effect.succeed(code ?? 1)));
		child.stdin.end(`${input}\n`);
		return Effect.sync(() => child.kill("SIGTERM"));
	});

export const AccountAccessProcessLive = Layer.succeed(
	AccountAccessProcess,
	AccountAccessProcess.of({
		capture: captureProcess,
		stream: streamProcess,
		input: inputProcess,
	}),
);

export interface AccountAccessServiceShape {
	readonly status: () => Effect.Effect<
		AccountAccessStatus,
		AccountAccessServiceError
	>;
	readonly startLogin: (
		providerId: "codex" | "cursor" | "grok",
	) => Stream.Stream<AccountAccessTransferEvent, AccountAccessServiceError>;
	readonly setCredential: (
		request: AccountAccessSetCredentialRequest,
	) => Effect.Effect<AccountAccessProviderStatus, AccountAccessServiceError>;
	readonly configureCustom: (
		request: AccountAccessCustomConfigRequest,
	) => Effect.Effect<AccountAccessProviderStatus, AccountAccessServiceError>;
	readonly disconnect: (
		providerId: AccountAccessProvider,
	) => Effect.Effect<AccountAccessProviderStatus, AccountAccessServiceError>;
	readonly sanitizeCredentials: () => Effect.Effect<
		void,
		AccountAccessServiceError
	>;
	readonly requestRuntimeStop: () => Effect.Effect<
		void,
		AccountAccessServiceError
	>;
}

export class AccountAccessService extends Context.Service<
	AccountAccessService,
	AccountAccessServiceShape
>()("zuse/AccountAccessService") {}

const commandFor = (providerId: AccountAccessProvider): string =>
	providerId === "cursor" ? "cursor-agent" : providerId;

const emptyStatus = (
	providerId: AccountAccessProvider,
	installed: boolean,
): AccountAccessProviderStatus =>
	new AccountAccessProviderStatus({
		providerId,
		state: installed ? "disconnected" : "missing-tool",
		installed,
	});

const validateSecret = (
	providerId: AccountAccessProvider,
	method: "subscription" | "api-key",
	secret: string,
): string => {
	const normalized = secret.trim();
	if (
		normalized.length < 8 ||
		Buffer.byteLength(normalized, "utf8") > MAX_SECRET_BYTES ||
		/[\r\n\0]/u.test(normalized)
	) {
		throw new AccountAccessServiceError("invalid-credential");
	}
	if (
		providerId === "claude" &&
		method === "subscription" &&
		!normalized.startsWith("sk-ant-oat01-")
	) {
		throw new AccountAccessServiceError("invalid-credential");
	}
	return normalized;
};

const validateBaseUrl = (value: string): string => {
	try {
		const url = new URL(value.trim());
		if (
			url.protocol !== "https:" ||
			url.username.length > 0 ||
			url.password.length > 0
		) {
			throw new Error("invalid_url");
		}
		return url.toString().replace(/\/$/u, "");
	} catch {
		throw new AccountAccessServiceError("invalid-configuration");
	}
};

export const AccountAccessServiceLive = Layer.effect(
	AccountAccessService,
	Effect.gen(function* () {
		const processRunner = yield* AccountAccessProcess;
		const credentials = yield* CredentialsService;
		const role = yield* MachineRuntimeRole;
		const paths = yield* AppPaths;

		const requireCloudRole = () =>
			role === "cloud-environment"
				? Effect.void
				: Effect.fail(new AccountAccessServiceError("not-allowed"));

		const capture = (
			command: string,
			args: ReadonlyArray<string>,
			environment?: Readonly<Record<string, string>>,
		) => processRunner.capture(command, args, environment);

		const commandInstalled = (command: string) =>
			capture(command, ["--version"]).pipe(
				Effect.map((result) => result.code === 0),
				Effect.orElseSucceed(() => false),
			);

		const nativeStatus = (
			providerId: AccountAccessProvider,
			secret?: string,
			credentialKind?: "api-key" | "oauth-token",
		): Effect.Effect<
			{ readonly connected: boolean; readonly label?: string },
			never
		> => {
			const probe =
				providerId === "codex"
					? ["login", "status"]
					: providerId === "cursor"
						? ["status"]
						: providerId === "grok"
							? ["models"]
							: ["auth", "status", "--json"];
			const environment: Readonly<Record<string, string>> | undefined =
				secret === undefined
					? undefined
					: providerId === "claude"
						? credentialKind === "oauth-token"
							? { CLAUDE_CODE_OAUTH_TOKEN: secret }
							: { ANTHROPIC_API_KEY: secret }
						: providerId === "cursor"
							? { CURSOR_API_KEY: secret }
							: providerId === "grok"
								? { GROK_CODE_XAI_API_KEY: secret, XAI_API_KEY: secret }
								: undefined;
			return capture(commandFor(providerId), probe, environment).pipe(
				Effect.map((result) => ({
					connected: result.code === 0,
					...(result.code === 0 && result.stdout.trim().length > 0
						? {
								label: redactAccountAccessOutput(result.stdout)
									.trim()
									.slice(0, 120),
							}
						: {}),
				})),
				Effect.orElseSucceed(() => ({ connected: false })),
			);
		};

		const providerStatus = Effect.fn("AccountAccess.providerStatus")(function* (
			providerId: AccountAccessProvider,
		) {
			const installed = yield* commandInstalled(commandFor(providerId));
			if (!installed) return emptyStatus(providerId, false);
			const managed = yield* credentials
				.getProviderCredential(providerId)
				.pipe(
					Effect.mapError(
						() => new AccountAccessServiceError("credential-store-failed"),
					),
				);
			if (managed !== null) {
				const verified = yield* nativeStatus(
					providerId,
					managed.secret,
					managed.kind,
				);
				return new AccountAccessProviderStatus({
					providerId,
					state: verified.connected ? "connected" : "expired",
					installed: true,
					authMethod:
						managed.kind === "oauth-token" ? "subscription" : "api-key",
					...(verified.connected ? { verifiedAt: Date.now() } : {}),
					...(verified.label === undefined
						? {}
						: { accountLabel: verified.label }),
				});
			}
			const native = yield* nativeStatus(providerId);
			if (!native.connected) return emptyStatus(providerId, true);
			return new AccountAccessProviderStatus({
				providerId,
				state: "connected",
				installed: true,
				authMethod: "subscription",
				verifiedAt: Date.now(),
				...(native.label === undefined ? {} : { accountLabel: native.label }),
			});
		});

		const status = Effect.fn("AccountAccess.status")(function* () {
			yield* requireCloudRole();
			const providers = yield* Effect.all(PROVIDERS.map(providerStatus), {
				concurrency: PROVIDERS.length,
			});
			return new AccountAccessStatus({ providers });
		});

		const startLogin = (
			providerId: "codex" | "cursor" | "grok",
		): Stream.Stream<AccountAccessTransferEvent, AccountAccessServiceError> => {
			if (role !== "cloud-environment") {
				return Stream.fail(new AccountAccessServiceError("not-allowed"));
			}
			const command = getAccountAccessLoginCommand(providerId);
			let verificationEmitted = false;
			let pendingCode: string | undefined;
			let pendingUrl: string | undefined;
			return processRunner
				.stream(command.command, command.args, command.environment)
				.pipe(
					Stream.flatMap((event) => {
						if (event._tag === "exit") {
							return Stream.succeed<AccountAccessTransferEvent>({
								_tag: "done",
								ok: event.code === 0,
								...(event.code === 0 ? {} : { reason: "login-failed" }),
							});
						}
						const safe = redactAccountAccessOutput(event.text).slice(0, 500);
						const verification = parseDeviceLoginVerification(providerId, safe);
						pendingCode ??= verification.code;
						pendingUrl ??= verification.url;
						if (!verificationEmitted && pendingUrl !== undefined) {
							verificationEmitted = true;
							return Stream.succeed<AccountAccessTransferEvent>({
								_tag: "verification",
								url: pendingUrl,
								...(pendingCode === undefined ? {} : { code: pendingCode }),
							});
						}
						return Stream.succeed<AccountAccessTransferEvent>({
							_tag: "progress",
							message: "Waiting for authorization…",
						});
					}),
				);
		};

		const setCredential = Effect.fn("AccountAccess.setCredential")(function* (
			request: AccountAccessSetCredentialRequest,
		) {
			yield* requireCloudRole();
			if (
				request.method === "subscription" &&
				request.providerId !== "claude"
			) {
				return yield* Effect.fail(
					new AccountAccessServiceError("invalid-configuration"),
				);
			}
			const secret = validateSecret(
				request.providerId,
				request.method,
				request.secret,
			);
			if (request.providerId === "codex" && request.method === "api-key") {
				const exitCode = yield* processRunner.input(
					"codex",
					["login", "--with-api-key"],
					secret,
				);
				if (exitCode !== 0) {
					return yield* Effect.fail(
						new AccountAccessServiceError("login-failed"),
					);
				}
			}
			yield* credentials
				.setProviderCredential(request.providerId, {
					kind: request.method === "subscription" ? "oauth-token" : "api-key",
					secret,
				})
				.pipe(
					Effect.mapError(
						() => new AccountAccessServiceError("credential-store-failed"),
					),
				);
			return yield* providerStatus(request.providerId);
		});

		const configureCustom = Effect.fn("AccountAccess.configureCustom")(
			function* (request: AccountAccessCustomConfigRequest) {
				yield* requireCloudRole();
				const baseUrl = validateBaseUrl(request.baseUrl);
				const secret = validateSecret(
					request.providerId,
					"api-key",
					request.secret,
				);
				const modelProvider = request.modelProvider?.trim();
				if (
					modelProvider !== undefined &&
					!/^[a-zA-Z0-9_-]{1,64}$/u.test(modelProvider)
				) {
					return yield* Effect.fail(
						new AccountAccessServiceError("invalid-configuration"),
					);
				}
				yield* credentials
					.setProviderCredential(request.providerId, {
						kind: "api-key",
						secret,
					})
					.pipe(
						Effect.mapError(
							() => new AccountAccessServiceError("credential-store-failed"),
						),
					);
				const configDirectory = join(paths.userData, "provider-config");
				yield* Effect.tryPromise({
					try: async () => {
						await mkdir(configDirectory, { recursive: true, mode: 0o700 });
						await writeFile(
							join(configDirectory, `${request.providerId}.json`),
							`${JSON.stringify({
								baseUrl,
								...(modelProvider === undefined ? {} : { modelProvider }),
							})}\n`,
							{ mode: 0o600 },
						);
					},
					catch: () => new AccountAccessServiceError("credential-store-failed"),
				});
				return new AccountAccessProviderStatus({
					providerId: request.providerId,
					state: "connected",
					installed: true,
					authMethod: "custom",
					verifiedAt: Date.now(),
				});
			},
		);

		const disconnect = Effect.fn("AccountAccess.disconnect")(function* (
			providerId: AccountAccessProvider,
		) {
			yield* requireCloudRole();
			yield* credentials
				.remove(providerId)
				.pipe(
					Effect.mapError(
						() => new AccountAccessServiceError("credential-store-failed"),
					),
				);
			const logoutArgs =
				providerId === "codex"
					? ["logout"]
					: providerId === "cursor"
						? ["logout"]
						: providerId === "grok"
							? ["logout"]
							: ["auth", "logout"];
			yield* capture(commandFor(providerId), logoutArgs).pipe(Effect.ignore);
			yield* Effect.tryPromise({
				try: () =>
					rm(join(paths.userData, "provider-config", `${providerId}.json`), {
						force: true,
					}),
				catch: () => new AccountAccessServiceError("credential-store-failed"),
			});
			return yield* providerStatus(providerId);
		});

		const sanitizeCredentials = Effect.fn("AccountAccess.sanitizeCredentials")(
			function* () {
				yield* requireCloudRole();
				for (const providerId of PROVIDERS) {
					yield* credentials.remove(providerId).pipe(Effect.ignore);
				}
				const accountHome =
					process.env.ZUSE_ACCOUNT_ACCESS_HOME?.trim() || homedir();
				const credentialPaths = [
					join(paths.userData, "secrets", "credentials.json"),
					join(paths.userData, "provider-config"),
					join(accountHome, ".codex", "auth.json"),
					join(accountHome, ".claude", ".credentials.json"),
					join(accountHome, ".cursor", "auth.json"),
					join(accountHome, ".grok", "auth.json"),
				];
				yield* Effect.all(
					PROVIDERS.map((providerId) =>
						capture(
							commandFor(providerId),
							providerId === "claude" ? ["auth", "logout"] : ["logout"],
						).pipe(Effect.ignore),
					),
					{ concurrency: PROVIDERS.length },
				);
				yield* Effect.tryPromise({
					try: async () => {
						for (const credentialPath of credentialPaths) {
							await rm(credentialPath, { recursive: true, force: true });
						}
					},
					catch: () => new AccountAccessServiceError("cleanup-failed"),
				});
			},
		);

		const requestRuntimeStop = Effect.fn("AccountAccess.requestRuntimeStop")(
			function* () {
				yield* requireCloudRole();
				const marker = join(paths.userData, "credential-cleanup-ready");
				yield* Effect.tryPromise({
					try: async () => {
						await mkdir(dirname(marker), { recursive: true, mode: 0o700 });
						await writeFile(marker, "sanitized\n", { mode: 0o600 });
					},
					catch: () => new AccountAccessServiceError("cleanup-failed"),
				});
			},
		);

		return AccountAccessService.of({
			status,
			startLogin,
			setCredential,
			configureCustom,
			disconnect,
			sanitizeCredentials,
			requestRuntimeStop,
		});
	}),
);
