import { makeRpcClientSession } from "@zuse/client-runtime/connection";
import {
	type ConnectionSnapshot,
	type ConnectionSupervisorEntry,
	createConnectionSupervisor,
} from "@zuse/client-runtime/supervisor";
import { MemoizeRpcs, WIRE_PROTOCOL_VERSION } from "@zuse/contracts";
import { Effect, Layer } from "effect";
import type { RpcClient, RpcGroup } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import { lastLocalPathUsesCellular } from "../../modules/local-connectivity";
import { verifyPinnedLocalServer } from "../lib/nearby-pairing";
import {
	logConnectionDiagnostic,
	logConnectionProblem,
} from "./connection-diagnostics";
import {
	isIntentionalConnectionInterruption,
	isRetryableClientError,
} from "./connection-failures";
import {
	applyRelayGrantToOptions,
	chooseAndDescribeGrant,
	consumePrivateNetworkHandshakeFailure,
	type GrantPathKind,
	notePrivateNetworkHandshakeFailure,
} from "./endpoint-selection";
import { ConnectionFailed } from "./errors";
import { makeMobileWebSocket } from "./mobile-websocket";
import { connectEnvironment } from "./relay-client";
import { type WsProtocolOptions, wsClientProtocolLayer } from "./ws-protocol";

export type MemoizeClient = RpcClient.RpcClient<
	RpcGroup.Rpcs<typeof MemoizeRpcs>,
	RpcClientError
>;

export type { ConnectionSnapshot } from "@zuse/client-runtime/supervisor";

const runtimeKey = (options: WsProtocolOptions) =>
	options.key ??
	options.environmentId ??
	`${options.wsBaseUrl ?? `${options.host}:${options.port}`}`;

export type RelayEndpointWrite = {
	readonly environmentId: string;
	readonly host: string;
	readonly port: number;
	readonly wsBaseUrl: string;
	readonly token: string;
	readonly grantPathKind: GrantPathKind;
};

let writeRelayEndpoint: ((path: RelayEndpointWrite) => Promise<void>) | null =
	null;
let lastPreparedOptions: WsProtocolOptions | null = null;

export const registerRelayEndpointWriter = (
	write: (path: RelayEndpointWrite) => Promise<void>,
): void => {
	writeRelayEndpoint = write;
};

const makeClientSession = (options: WsProtocolOptions) => {
	logConnectionDiagnostic("runtime.create", {
		key: runtimeKey(options),
		relay: options.environmentId !== undefined,
		wsBaseUrl: options.wsBaseUrl ?? null,
		host: options.host,
		port: options.port,
		grantPathKind: options.grantPathKind ?? null,
		hasToken: options.token !== undefined && options.token !== null,
	});
	const protocolLayer = wsClientProtocolLayer(options, {
		// Managed environments can cold-start behind the tunnel. The native
		// default of ten seconds was too aggressive on physical devices.
		openTimeout: "25 seconds",
		makeWebSocket: makeMobileWebSocket,
	}).pipe(Layer.orDie);
	return makeRpcClientSession(protocolLayer, MemoizeRpcs, {
		protocolVersion: WIRE_PROTOCOL_VERSION,
		perform: (client, hello) => client["connect.handshake"](hello),
	});
};

const prepareOptions = async (
	options: WsProtocolOptions,
): Promise<WsProtocolOptions> => {
	if (
		options.serverPublicKey !== undefined &&
		options.serverKeyPin !== undefined
	) {
		await verifyPinnedLocalServer({
			host: options.host,
			port: options.port,
			publicKey: options.serverPublicKey,
			pin: options.serverKeyPin,
		});
	}
	if (
		options.refreshAccountGrant !== true ||
		options.environmentId === undefined
	) {
		lastPreparedOptions = options;
		return options;
	}
	const key = runtimeKey(options);
	logConnectionDiagnostic("relay.connect_grant.start", {
		key,
		environmentId: options.environmentId,
	});
	const grant = await connectEnvironment(options.environmentId);
	const skipPrivateNetwork = consumePrivateNetworkHandshakeFailure(key);
	const chosen = await chooseAndDescribeGrant(grant, {
		usesCellular: lastLocalPathUsesCellular(),
		skipPrivateNetwork,
	});
	const next = applyRelayGrantToOptions(options, grant, chosen);
	logConnectionDiagnostic("relay.connect_grant.ok", {
		key,
		environmentId: options.environmentId,
		wsBaseUrl: next.wsBaseUrl ?? null,
		grantPathKind: chosen.grantPathKind,
		probeMs: chosen.probeMs,
		skippedProbe: chosen.probeMs === null,
		expiresAt: grant.expiresAt,
	});
	await writeRelayEndpoint?.({
		environmentId: options.environmentId,
		host: next.host,
		port: next.port,
		wsBaseUrl: chosen.endpoint.wsBaseUrl,
		token: grant.connectToken,
		grantPathKind: chosen.grantPathKind,
	});
	lastPreparedOptions = next;
	return next;
};

const supervisor = createConnectionSupervisor<WsProtocolOptions, MemoizeClient>(
	{
		keyOf: runtimeKey,
		prepareOptions,
		createClient: async (options) => {
			try {
				return await makeClientSession(options);
			} catch (cause) {
				notePrivateNetworkHandshakeFailure(
					runtimeKey(options),
					options.grantPathKind,
				);
				throw cause;
			}
		},
		validateClient: async (client) => {
			try {
				await Effect.runPromise(
					client["connect.describe"]().pipe(Effect.asVoid),
				);
			} catch (cause) {
				if (lastPreparedOptions !== null) {
					notePrivateNetworkHandshakeFailure(
						runtimeKey(lastPreparedOptions),
						lastPreparedOptions.grantPathKind,
					);
				}
				throw cause;
			}
		},
		isOnline: () => currentOnline,
		shouldReconnectOnOptionsChange: (previous, next) =>
			previous.host !== next.host ||
			previous.port !== next.port ||
			previous.wsBaseUrl !== next.wsBaseUrl ||
			previous.token !== next.token ||
			previous.environmentId !== next.environmentId ||
			previous.routeGeneration !== next.routeGeneration ||
			previous.grantPathKind !== next.grantPathKind,
		schedule: (delayMs, fn) => {
			const timer = setTimeout(fn, delayMs);
			return () => clearTimeout(timer);
		},
		onDiagnostic: ({ event, key, details }) => {
			logConnectionDiagnostic(`supervisor.${event}`, { key, ...details });
		},
		isRetryableCommandError: isRetryableClientError,
		isIgnorableFailure: isIntentionalConnectionInterruption,
	},
);

let currentOnline = true;

export const isConnectionOnline = (): boolean => currentOnline;

const connectionEntry = (
	options: WsProtocolOptions,
): ConnectionSupervisorEntry<MemoizeClient> => supervisor.get(options);

export const getConnectionClient = (
	options: WsProtocolOptions,
): Effect.Effect<MemoizeClient, ConnectionFailed> =>
	connectionEntry(options)
		.getClient()
		.pipe(
			Effect.mapError(
				(cause) => new ConnectionFailed({ message: cause.message }),
			),
		);

export const disposeConnection = (options: WsProtocolOptions): Promise<void> =>
	connectionEntry(options).remove();

export const reportConnectionFailure = (
	options: WsProtocolOptions,
	cause: unknown,
): void => {
	if (
		isIntentionalConnectionInterruption(cause) ||
		!isRetryableClientError(cause)
	) {
		return;
	}
	logConnectionProblem("runtime.report_failure", {
		key: runtimeKey(options),
		reason: cause instanceof Error ? cause.message : String(cause),
	});
	connectionEntry(options).reportFailure(cause);
};

export const retryConnectionNow = (options: WsProtocolOptions): void => {
	connectionEntry(options).retryNow();
};

/**
 * Push updated options into the supervisor without waiting for a screen to
 * re-subscribe. When the route changed (host/port/routeGeneration), the
 * supervisor reconnects immediately — this is how the connectivity runtime
 * wakes an exhausted entry the moment a fresh local route lands.
 */
export const applyConnectionOptions = (options: WsProtocolOptions): void => {
	connectionEntry(options);
};

export const subscribeConnection = (
	options: WsProtocolOptions,
	listener: (snapshot: ConnectionSnapshot) => void,
): (() => void) => connectionEntry(options).subscribe(listener);

export const setConnectionOnline = (online: boolean): void => {
	logConnectionDiagnostic("runtime.online_set", { online });
	currentOnline = online;
	supervisor.setOnline(online);
};

export const getConnectionSnapshot = (
	options: WsProtocolOptions,
): ConnectionSnapshot => connectionEntry(options).snapshot();
