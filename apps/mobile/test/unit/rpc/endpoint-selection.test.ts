import { type RelayConnectGrant, WIRE_PROTOCOL_VERSION } from "@zuse/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
	applyRelayGrantToOptions,
	chooseAndDescribeGrant,
	chooseGrantEndpoint,
	connectionFieldsForEndpoint,
	consumePrivateNetworkHandshakeFailure,
	notePrivateNetworkHandshakeFailure,
	resetPrivateNetworkHandshakeFailures,
} from "../../../src/rpc/endpoint-selection";

const grant: RelayConnectGrant = {
	endpoint: {
		httpBaseUrl: "https://managed.test",
		wsBaseUrl: "wss://managed.test",
	},
	endpointCandidates: [
		{
			kind: "private-network",
			endpoint: {
				httpBaseUrl: "http://100.64.0.8:47837",
				wsBaseUrl: "ws://100.64.0.8:47837",
			},
		},
		{
			kind: "managed-tunnel",
			endpoint: {
				httpBaseUrl: "https://managed.test",
				wsBaseUrl: "wss://managed.test",
			},
		},
	],
	connectToken: "token",
	expiresAt: Date.now() + 60_000,
};

const healthyFetch = () =>
	vi.fn(async (input: unknown, init?: { readonly headers?: unknown }) => {
		expect(String(input)).toBe("http://100.64.0.8:47837/healthz");
		expect(init?.headers).toBeUndefined();
		return {
			ok: true,
			json: async () => ({
				status: "ok",
				wireProtocolVersion: WIRE_PROTOCOL_VERSION,
			}),
		};
	});

afterEach(() => {
	vi.unstubAllGlobals();
	resetPrivateNetworkHandshakeFailures();
});

describe("cloud endpoint selection", () => {
	test("uses a healthy private endpoint", async () => {
		vi.stubGlobal("fetch", healthyFetch());

		expect(await chooseGrantEndpoint(grant)).toEqual(
			grant.endpointCandidates?.[0]?.endpoint,
		);
	});

	test("falls back to the managed tunnel when the private probe fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Promise.reject(new Error("offline"))),
		);

		expect(await chooseGrantEndpoint(grant)).toEqual(
			grant.endpointCandidates?.[1]?.endpoint,
		);
	});

	test("falls back when /healthz reports a wire-protocol mismatch", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					status: "ok",
					wireProtocolVersion: WIRE_PROTOCOL_VERSION + 1,
				}),
			})),
		);

		const chosen = await chooseAndDescribeGrant(grant);
		expect(chosen.grantPathKind).toBe("managed-tunnel");
		expect(chosen.endpoint).toEqual(grant.endpointCandidates?.[1]?.endpoint);
		expect(chosen.probeMs).toBeGreaterThanOrEqual(0);
	});

	test("skips the probe on cellular and uses the tunnel", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const chosen = await chooseAndDescribeGrant(grant, { usesCellular: true });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(chosen).toEqual({
			endpoint: grant.endpointCandidates?.[1]?.endpoint,
			grantPathKind: "managed-tunnel",
			probeMs: null,
		});
	});

	test("probes when cellular is unknown", async () => {
		const fetchMock = healthyFetch();
		vi.stubGlobal("fetch", fetchMock);

		const chosen = await chooseAndDescribeGrant(grant, {});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(chosen.grantPathKind).toBe("private-network");
		expect(chosen.probeMs).not.toBeNull();
	});

	test("does not probe when there is no private-network candidate", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const tunnelOnly: RelayConnectGrant = {
			...grant,
			endpointCandidates: grant.endpointCandidates?.slice(1),
		};

		const chosen = await chooseAndDescribeGrant(tunnelOnly);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(chosen.grantPathKind).toBe("managed-tunnel");
		expect(chosen.probeMs).toBeNull();
	});

	test("handshake failure skips the next private probe once", async () => {
		const fetchMock = healthyFetch();
		vi.stubGlobal("fetch", fetchMock);

		notePrivateNetworkHandshakeFailure("env-1", "private-network");
		const skipped = await chooseAndDescribeGrant(grant, {
			skipPrivateNetwork: consumePrivateNetworkHandshakeFailure("env-1"),
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(skipped.grantPathKind).toBe("managed-tunnel");

		const second = await chooseAndDescribeGrant(grant, {
			skipPrivateNetwork: consumePrivateNetworkHandshakeFailure("env-1"),
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(second.grantPathKind).toBe("private-network");
	});

	test("does not mark a tunnel handshake failure as a skip", () => {
		notePrivateNetworkHandshakeFailure("env-1", "managed-tunnel");
		expect(consumePrivateNetworkHandshakeFailure("env-1")).toBe(false);
	});

	test("applies the chosen grant to supervisor options before getClient", () => {
		const previous = {
			host: "managed.test",
			port: 443,
			wsBaseUrl: "wss://managed.test",
			environmentId: "env-1",
			refreshAccountGrant: true as const,
			token: "old",
		};
		const next = applyRelayGrantToOptions(previous, grant, {
			endpoint: grant.endpointCandidates?.[0]?.endpoint ?? grant.endpoint,
			grantPathKind: "private-network",
			probeMs: 12,
		});
		expect(next).toMatchObject({
			host: "100.64.0.8",
			port: 47837,
			wsBaseUrl: "ws://100.64.0.8:47837",
			token: "token",
			grantPathKind: "private-network",
			environmentId: "env-1",
		});
		expect(connectionFieldsForEndpoint(grant.endpoint)).toEqual({
			host: "managed.test",
			port: 443,
			wsBaseUrl: "wss://managed.test",
		});
	});
});
