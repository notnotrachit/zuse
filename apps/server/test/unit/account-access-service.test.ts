import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect, Layer, Stream } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
	AccountAccessProcess,
	type AccountAccessProcessShape,
	AccountAccessService,
	AccountAccessServiceLive,
} from "../../src/account-access/service.ts";
import { AppPaths } from "../../src/app-paths.ts";
import { MachineRuntimeRole } from "../../src/machine/machine-runtime-role.ts";
import { makeFileCredentialsService } from "../../src/provider/layers/file-credentials-service.ts";
import { CredentialsService } from "../../src/provider/services/credentials-service.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

const makeLayer = (
	userData: string,
	processOverrides: Partial<AccountAccessProcessShape> = {},
	role: "control-plane" | "cloud-environment" = "cloud-environment",
) => {
	const credentials = makeFileCredentialsService(userData);
	const processRunner: AccountAccessProcessShape = {
		capture: (_command, args) =>
			Effect.succeed({
				stdout: args.includes("status") ? "signed in" : "1.0.0",
				stderr: "",
				code: 0,
			}),
		stream: () => Stream.empty,
		input: () => Effect.succeed(0),
		...processOverrides,
	};
	const service = AccountAccessServiceLive.pipe(
		Layer.provide(credentials),
		Layer.provide(Layer.succeed(AppPaths, { userData })),
		Layer.provide(Layer.succeed(MachineRuntimeRole, role)),
		Layer.provide(
			Layer.succeed(
				AccountAccessProcess,
				AccountAccessProcess.of(processRunner),
			),
		),
	);
	return Layer.merge(service, credentials);
};

const withService = async <A>(
	run: (service: AccountAccessService["Service"]) => Effect.Effect<A, unknown>,
	processOverrides: Partial<AccountAccessProcessShape> = {},
	role: "control-plane" | "cloud-environment" = "cloud-environment",
) => {
	const userData = await mkdtemp(join(tmpdir(), "zuse-account-access-"));
	temporaryDirectories.push(userData);
	return Effect.runPromise(
		Effect.gen(function* () {
			const service = yield* AccountAccessService;
			return yield* run(service);
		}).pipe(Effect.provide(makeLayer(userData, processOverrides, role))),
	);
};

describe("AccountAccessService", () => {
	it("keeps the four provider states on the target machine", async () => {
		const status = await withService((service) => service.status());
		expect(status.providers.map((provider) => provider.providerId)).toEqual([
			"claude",
			"codex",
			"cursor",
			"grok",
		]);
		expect(
			status.providers.every((provider) => provider.state === "connected"),
		).toBe(true);
	});

	it("stores a newly issued Claude setup token only in the target secret store", async () => {
		const userData = await mkdtemp(join(tmpdir(), "zuse-account-access-"));
		temporaryDirectories.push(userData);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const service = yield* AccountAccessService;
				const status = yield* service.setCredential({
					providerId: "claude",
					method: "subscription",
					secret: "sk-ant-oat01-new-machine-purpose-token",
				});
				const stored = yield* CredentialsService;
				return {
					status,
					credential: yield* stored.getProviderCredential("claude"),
				};
			}).pipe(Effect.provide(makeLayer(userData))),
		);
		expect(result.status).toMatchObject({
			state: "connected",
			authMethod: "subscription",
		});
		expect(result.credential?.secret).toBe(
			"sk-ant-oat01-new-machine-purpose-token",
		);
		const file = join(userData, "secrets", "credentials.json");
		expect((await stat(file)).mode & 0o777).toBe(0o600);
	});

	it("rejects subscription tokens for providers that require their official login flow", async () => {
		await expect(
			withService((service) =>
				service.setCredential({
					providerId: "codex",
					method: "subscription",
					secret: "not-used-token",
				}),
			),
		).rejects.toMatchObject({ code: "invalid-configuration" });
	});

	it("feeds Codex API keys to the official stdin login without returning them", async () => {
		let received: {
			readonly args: ReadonlyArray<string>;
			readonly input: string;
		} | null = null;
		const status = await withService(
			(service) =>
				service.setCredential({
					providerId: "codex",
					method: "api-key",
					secret: "openai-machine-key",
				}),
			{
				input: (_command, args, input) => {
					received = { args, input };
					return Effect.succeed(0);
				},
			},
		);
		expect(received).toEqual({
			args: ["login", "--with-api-key"],
			input: "openai-machine-key",
		});
		expect(JSON.stringify(status)).not.toContain("openai-machine-key");
	});

	it("marks a stored provider credential expired when its real CLI probe fails", async () => {
		const userData = await mkdtemp(join(tmpdir(), "zuse-account-access-"));
		temporaryDirectories.push(userData);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const service = yield* AccountAccessService;
				yield* service.setCredential({
					providerId: "grok",
					method: "api-key",
					secret: "expired-xai-key",
				});
				return yield* service.status();
			}).pipe(
				Effect.provide(
					makeLayer(userData, {
						capture: (_command, args) =>
							Effect.succeed({
								stdout: "",
								stderr: "unauthorized",
								code: args.includes("models") ? 1 : 0,
							}),
					}),
				),
			),
		);
		expect(
			result.providers.find((provider) => provider.providerId === "grok")
				?.state,
		).toBe("expired");
	});

	it("writes only non-secret custom configuration outside the secret store", async () => {
		const userData = await mkdtemp(join(tmpdir(), "zuse-account-access-"));
		temporaryDirectories.push(userData);
		await Effect.runPromise(
			Effect.gen(function* () {
				const service = yield* AccountAccessService;
				yield* service.configureCustom({
					providerId: "grok",
					baseUrl: "https://models.example/v1/",
					modelProvider: "xai-compatible",
					secret: "secret-api-key",
				});
			}).pipe(Effect.provide(makeLayer(userData))),
		);
		const config = await readFile(
			join(userData, "provider-config", "grok.json"),
			"utf8",
		);
		expect(config).toContain("https://models.example/v1");
		expect(config).not.toContain("secret-api-key");
	});

	it("does not expose target-machine auth RPCs on the control plane", async () => {
		await expect(
			withService((service) => service.status(), {}, "control-plane"),
		).rejects.toMatchObject({ code: "not-allowed" });
	});
});
