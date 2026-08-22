import { EventEmitter } from "node:events";
import type { TunnelHandle } from "@zuse/ssh";
import { describe, expect, it } from "vitest";

import {
  PortForwardManager,
  type PortForwardTarget,
} from "../../src/tunnels/port-forward-service.ts";

const sshTarget: PortForwardTarget = {
  kind: "ssh",
  target: { alias: "devbox", hostname: "devbox", username: null, port: null },
};

type FakeProcess = EventEmitter & {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
};

const fakeTunnel = (
  localPort: number,
  remotePort: number,
): { handle: TunnelHandle; process: FakeProcess; closed: () => boolean } => {
  const process = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
  }) as FakeProcess;
  let closed = false;
  const handle = {
    localPort,
    remotePort,
    process,
    wsBaseUrl: `ws://127.0.0.1:${localPort}/rpc`,
    close: async () => {
      closed = true;
      process.exitCode = 0;
      process.emit("exit", 0, null);
    },
  } as unknown as TunnelHandle;
  return { handle, process, closed: () => closed };
};

describe("PortForwardManager", () => {
  it("prefers the remote port locally and is idempotent while alive", async () => {
    const opened: number[] = [];
    const manager = new PortForwardManager(
      async (input) => {
        opened.push(input.localPort);
        return fakeTunnel(input.localPort, input.remotePort).handle;
      },
      async () => true,
    );
    const first = await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    const second = await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    expect(first).toEqual({
      environmentId: "env-a",
      remotePort: 3000,
      localPort: 3000,
    });
    expect(second).toBe(first);
    expect(opened).toEqual([3000]);
  });

  it("falls back to a random local port when the preferred one is taken", async () => {
    const manager = new PortForwardManager(
      async (input) => fakeTunnel(input.localPort, input.remotePort).handle,
      async () => false,
    );
    const forward = await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    expect(forward.localPort).not.toBe(3000);
    expect(forward.localPort).toBeGreaterThanOrEqual(20_000);
  });

  it("retries once on a random port when the preferred bind is lost", async () => {
    const attempts: number[] = [];
    const manager = new PortForwardManager(
      async (input) => {
        attempts.push(input.localPort);
        if (attempts.length === 1) throw new Error("bind failed");
        return fakeTunnel(input.localPort, input.remotePort).handle;
      },
      async () => true,
    );
    const forward = await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    expect(attempts[0]).toBe(3000);
    expect(forward.localPort).not.toBe(3000);
  });

  it("evicts dead tunnels and reopens on the next request", async () => {
    let openCount = 0;
    const processes: FakeProcess[] = [];
    const manager = new PortForwardManager(
      async (input) => {
        openCount += 1;
        const tunnel = fakeTunnel(input.localPort, input.remotePort);
        processes.push(tunnel.process);
        return tunnel.handle;
      },
      async () => true,
    );
    await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    processes.at(-1)?.emit("exit", 1, null);
    expect(manager.list("env-a")).toEqual([]);
    await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    expect(openCount).toBe(2);
  });

  it("closes every forward that belongs to an environment", async () => {
    const manager = new PortForwardManager(
      async (input) => fakeTunnel(input.localPort, input.remotePort).handle,
      async () => true,
    );
    await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 3000,
    });
    await manager.open({
      environmentId: "env-a",
      target: sshTarget,
      remotePort: 8080,
    });
    await manager.open({
      environmentId: "env-b",
      target: sshTarget,
      remotePort: 5173,
    });
    await manager.closeForEnvironment("env-a");
    expect(manager.list("env-a")).toEqual([]);
    expect(manager.list("env-b")).toHaveLength(1);
    await manager.closeAll();
    expect(manager.list()).toEqual([]);
  });
});
