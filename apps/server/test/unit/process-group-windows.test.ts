import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
import {
	signalProcessGroup,
	spawnSupervisedCommand,
} from "../../src/process/process-group.ts";

const fakeChild = (pid = 123) => Object.assign(new EventEmitter(), { pid, kill: vi.fn() });

describe("Windows process trees", () => {
	beforeEach(() => {
		spawnMock.mockReset();
		vi.spyOn(process, "platform", "get").mockReturnValue("win32");
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it("uses taskkill /T /F instead of negative PIDs", () => {
		const child = fakeChild();
		const killer = fakeChild(456);
		spawnMock.mockReturnValue(killer);
		const kill = vi.spyOn(process, "kill");
		signalProcessGroup(child as unknown as ChildProcess, "SIGTERM");
		expect(spawnMock).toHaveBeenCalledWith("taskkill.exe", ["/PID", "123", "/T", "/F"], expect.objectContaining({ windowsHide: true }));
		killer.emit("close", 0);
		expect(kill).not.toHaveBeenCalled();
		expect(child.kill).not.toHaveBeenCalled();
	});

	it.each(["error", "nonzero", "throw"])("handles taskkill %s without throwing or an unhandled error", (failure) => {
		const child = fakeChild();
		const killer = fakeChild(456);
		if (failure === "throw") spawnMock.mockImplementation(() => { throw new Error("unavailable"); });
		else spawnMock.mockReturnValue(killer);
		child.kill.mockImplementation(() => { throw Object.assign(new Error("gone"), { code: "ESRCH" }); });
		expect(() => signalProcessGroup(child as unknown as ChildProcess, "SIGKILL")).not.toThrow();
		if (failure === "error") killer.emit("error", new Error("ENOENT"));
		if (failure !== "throw") killer.emit("close", 1);
		expect(child.kill).toHaveBeenCalledTimes(1);
		expect(console.error).toHaveBeenCalled();
	});

	it("ignores missing or invalid PIDs", () => {
		for (const pid of [undefined, 0, -1]) {
			signalProcessGroup({ pid } as ChildProcess, "SIGKILL");
		}
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it.each(["deadline", "pipe", "invalid-initial-lease"])("watchdog cleans a Windows tree on %s", (reason) => {
		spawnMock.mockReturnValue(fakeChild());
		spawnSupervisedCommand('echo "quoted" & echo %PATH%', "C:\\work", 2000);
		const call = spawnMock.mock.calls[0];
		if (call === undefined) throw new Error("Supervisor was not spawned");
		const [, args, options] = call;
		expect(options.detached).toBe(false);
		expect(JSON.parse(args[3])).toEqual(["/d", "/s", "/c", 'echo "quoted" & echo %PATH%']);
		const child = fakeChild();
		const killer = fakeChild(456);
		const innerSpawn = vi.fn().mockReturnValueOnce(child).mockReturnValueOnce(killer);
		const stdin = Object.assign(new EventEmitter(), { resume: vi.fn(), pause: vi.fn(), destroy: vi.fn() });
		const exit = vi.fn();
		const kill = vi.fn();
		let tick = () => {};
		let now = reason === "invalid-initial-lease" ? 3000 : 1000;
		runInNewContext(args[1], {
			require: () => ({ spawn: innerSpawn }),
			process: { platform: "win32", argv: ["node", ...args.slice(2)], stdin, exit, kill },
			console,
			Date: { now: () => now },
			setInterval: (callback: () => void) => { tick = callback; },
			clearInterval: vi.fn(),
		});
		if (reason === "invalid-initial-lease") {
			expect(innerSpawn).not.toHaveBeenCalled();
			expect(exit).toHaveBeenCalledWith(1);
			return;
		}
		now = 3000;
		if (reason === "deadline") tick();
		else stdin.emit("end");
		expect(innerSpawn).toHaveBeenLastCalledWith("taskkill.exe", ["/PID", "123", "/T", "/F"], expect.any(Object));
		// A command exit racing taskkill must not abandon the cleanup process.
		child.emit("exit", 1);
		expect(exit).not.toHaveBeenCalled();
		killer.emit("close", 0);
		expect(exit).toHaveBeenCalledWith(1);
		expect(kill).not.toHaveBeenCalled();
	});
});
