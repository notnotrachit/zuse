import type { EnvironmentEndpoint, RelayConnectGrant } from "@zuse/contracts";
import { WIRE_PROTOCOL_VERSION } from "@zuse/contracts";

export type GrantPathKind = "private-network" | "managed-tunnel";

export type ChosenGrantEndpoint = {
	readonly endpoint: EnvironmentEndpoint;
	readonly grantPathKind: GrantPathKind;
	readonly probeMs: number | null;
};

const handshakeFallbackKeys = new Set<string>();

export const notePrivateNetworkHandshakeFailure = (
	key: string,
	grantPathKind: GrantPathKind | undefined,
): void => {
	if (grantPathKind === "private-network") handshakeFallbackKeys.add(key);
};

export const consumePrivateNetworkHandshakeFailure = (key: string): boolean =>
	handshakeFallbackKeys.delete(key);

export const resetPrivateNetworkHandshakeFailures = (): void => {
	handshakeFallbackKeys.clear();
};

export const connectionFieldsForEndpoint = (
	endpoint: EnvironmentEndpoint,
): {
	readonly host: string;
	readonly port: number;
	readonly wsBaseUrl: string;
} => {
	const url = new URL(endpoint.wsBaseUrl);
	return {
		host: url.hostname,
		port:
			Number(url.port) || (endpoint.wsBaseUrl.startsWith("wss:") ? 443 : 80),
		wsBaseUrl: endpoint.wsBaseUrl,
	};
};

const tunnelEndpointOf = (grant: RelayConnectGrant): EnvironmentEndpoint =>
	grant.endpointCandidates?.find(
		(candidate) => candidate.kind === "managed-tunnel",
	)?.endpoint ?? grant.endpoint;

const privateEndpointOf = (
	grant: RelayConnectGrant,
): EnvironmentEndpoint | undefined =>
	grant.endpointCandidates?.find(
		(candidate) => candidate.kind === "private-network",
	)?.endpoint;

/**
 * Unauthenticated liveness check. Do not attach the connect token — `/healthz`
 * is public and the handshake is the real bind.
 */
const probePrivateEndpoint = async (
	endpoint: EnvironmentEndpoint,
): Promise<boolean> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 1_200);
	try {
		const health = new URL("/healthz", endpoint.httpBaseUrl).toString();
		const response = await fetch(health, { signal: controller.signal });
		if (!response.ok) return false;
		const body = (await response.json()) as {
			readonly status?: unknown;
			readonly wireProtocolVersion?: unknown;
		};
		return (
			body.status === "ok" && body.wireProtocolVersion === WIRE_PROTOCOL_VERSION
		);
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Skip `/healthz` when the radio is cellular, when there is no private-network
 * candidate, or when a private-network handshake just failed (one-shot).
 * Unknown cellular probes. Last `grantPathKind` is not a skip input.
 */
export const chooseAndDescribeGrant = async (
	grant: RelayConnectGrant,
	input: {
		readonly usesCellular?: boolean;
		readonly skipPrivateNetwork?: boolean;
	} = {},
): Promise<ChosenGrantEndpoint> => {
	const privateEndpoint = privateEndpointOf(grant);
	const tunnelEndpoint = tunnelEndpointOf(grant);
	const skipProbe =
		input.skipPrivateNetwork === true ||
		input.usesCellular === true ||
		privateEndpoint === undefined;
	if (skipProbe) {
		return {
			endpoint: tunnelEndpoint,
			grantPathKind: "managed-tunnel",
			probeMs: null,
		};
	}

	const started = Date.now();
	const healthy = await probePrivateEndpoint(privateEndpoint);
	const probeMs = Date.now() - started;
	if (healthy) {
		return {
			endpoint: privateEndpoint,
			grantPathKind: "private-network",
			probeMs,
		};
	}
	return {
		endpoint: tunnelEndpoint,
		grantPathKind: "managed-tunnel",
		probeMs,
	};
};

export const chooseGrantEndpoint = async (
	grant: RelayConnectGrant,
): Promise<EnvironmentEndpoint> =>
	(await chooseAndDescribeGrant(grant)).endpoint;

export const applyRelayGrantToOptions = <
	Options extends {
		readonly host: string;
		readonly port: number;
		readonly wsBaseUrl?: string | null;
		readonly token?: string | null;
		readonly grantPathKind?: GrantPathKind;
	},
>(
	options: Options,
	grant: { readonly connectToken: string },
	chosen: ChosenGrantEndpoint,
): Options => ({
	...options,
	...connectionFieldsForEndpoint(chosen.endpoint),
	token: grant.connectToken,
	grantPathKind: chosen.grantPathKind,
});
