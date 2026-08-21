import { createServer } from "node:net";
import type { SshEnvironmentTarget } from "@zuse/contracts";
import { openTunnel, randomLocalPort, type TunnelHandle } from "@zuse/ssh";
import { Effect } from "effect";

import {
	cloudSshConfigPath,
	cloudSshHostAlias,
} from "../ssh/cloud-ssh-service.ts";

/**
 * Local forwards for dev servers on remote environments. SSH boxes forward
 * over a plain `ssh -N -L`; cloud workspaces ride the managed `zuse-*` alias
 * whose ProxyCommand bridges a WebSocket to the sandbox's sshd. Managed
 * persistent machines add a target kind here once they expose an ssh path.
 */
export type PortForwardTarget =
	| { readonly kind: "ssh"; readonly target: SshEnvironmentTarget }
	| { readonly kind: "cloud"; readonly workspaceId: string };

export interface PortForwardSummary {
	readonly environmentId: string;
	readonly remotePort: number;
	readonly localPort: number;
}

export type OpenForwardTunnel = (input: {
	readonly target: PortForwardTarget;
	readonly remotePort: number;
	readonly localPort: number;
}) => Promise<TunnelHandle>;

const defaultOpenForwardTunnel: OpenForwardTunnel = (input) =>
	Effect.runPromise(
		input.target.kind === "cloud"
			? openTunnel({
					host: cloudSshHostAlias(input.target.workspaceId),
					remotePort: input.remotePort,
					localPort: input.localPort,
					configFile: cloudSshConfigPath(),
				})
			: openTunnel({
					target: input.target.target,
					remotePort: input.remotePort,
					localPort: input.localPort,
				}),
	);

const localPortFree = (port: number): Promise<boolean> =>
	new Promise((resolve) => {
		const probe = createServer();
		probe.once("error", () => resolve(false));
		probe.listen(port, "127.0.0.1", () => {
			probe.close(() => resolve(true));
		});
	});

const tunnelAlive = (handle: TunnelHandle): boolean =>
	handle.process.exitCode === null && handle.process.signalCode === null;

const forwardKey = (environmentId: string, remotePort: number): string =>
	`${environmentId}:${remotePort}`;

type ForwardEntry = {
	readonly summary: PortForwardSummary;
	readonly handle: TunnelHandle;
};

export class PortForwardManager {
	private readonly forwards = new Map<string, ForwardEntry>();
	private readonly pending = new Map<string, Promise<PortForwardSummary>>();

	constructor(
		private readonly openForwardTunnel: OpenForwardTunnel = defaultOpenForwardTunnel,
		private readonly isLocalPortFree: (
			port: number,
		) => Promise<boolean> = localPortFree,
	) {}

	/** Idempotent: an existing live forward for the same port is returned. */
	open(input: {
		readonly environmentId: string;
		readonly target: PortForwardTarget;
		readonly remotePort: number;
	}): Promise<PortForwardSummary> {
		const key = forwardKey(input.environmentId, input.remotePort);
		const existing = this.forwards.get(key);
		if (existing !== undefined && tunnelAlive(existing.handle)) {
			return Promise.resolve(existing.summary);
		}
		const inFlight = this.pending.get(key);
		if (inFlight !== undefined) return inFlight;
		const operation = this.connect(key, input).finally(() => {
			if (this.pending.get(key) === operation) this.pending.delete(key);
		});
		this.pending.set(key, operation);
		return operation;
	}

	async close(environmentId: string, remotePort: number): Promise<void> {
		const key = forwardKey(environmentId, remotePort);
		const entry = this.forwards.get(key);
		this.forwards.delete(key);
		await entry?.handle.close();
	}

	async closeForEnvironment(environmentId: string): Promise<void> {
		const entries = [...this.forwards.entries()].filter(
			([, entry]) => entry.summary.environmentId === environmentId,
		);
		for (const [key] of entries) this.forwards.delete(key);
		await Promise.all(entries.map(([, entry]) => entry.handle.close()));
	}

	async closeAll(): Promise<void> {
		const entries = [...this.forwards.values()];
		this.forwards.clear();
		await Promise.all(entries.map((entry) => entry.handle.close()));
	}

	list(environmentId?: string): ReadonlyArray<PortForwardSummary> {
		return [...this.forwards.values()]
			.filter(
				(entry) =>
					tunnelAlive(entry.handle) &&
					(environmentId === undefined ||
						entry.summary.environmentId === environmentId),
			)
			.map((entry) => entry.summary);
	}

	private async connect(
		key: string,
		input: {
			readonly environmentId: string;
			readonly target: PortForwardTarget;
			readonly remotePort: number;
		},
	): Promise<PortForwardSummary> {
		// Prefer the remote port locally so the tunneled URL matches the dev
		// server's own; fall back to a random port when it is taken.
		const preferred = (await this.isLocalPortFree(input.remotePort))
			? input.remotePort
			: randomLocalPort();
		let handle: TunnelHandle;
		try {
			handle = await this.openForwardTunnel({
				target: input.target,
				remotePort: input.remotePort,
				localPort: preferred,
			});
		} catch (cause) {
			// The preferred port can be taken between the probe and ssh's bind
			// (ExitOnForwardFailure makes that loss visible); retry once on a
			// random port before surfacing the failure.
			if (preferred !== input.remotePort) throw cause;
			handle = await this.openForwardTunnel({
				target: input.target,
				remotePort: input.remotePort,
				localPort: randomLocalPort(),
			});
		}
		const entry: ForwardEntry = {
			summary: {
				environmentId: input.environmentId,
				remotePort: input.remotePort,
				localPort: handle.localPort,
			},
			handle,
		};
		this.forwards.set(key, entry);
		handle.process.once("exit", () => {
			if (this.forwards.get(key) === entry) this.forwards.delete(key);
		});
		return entry.summary;
	}
}
