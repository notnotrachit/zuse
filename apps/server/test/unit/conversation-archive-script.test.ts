import { EventEmitter } from "node:events";
import { ChatId } from "@zuse/contracts";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock, signalMock } = vi.hoisted(() => ({ spawnMock: vi.fn(), signalMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("../../src/process/process-group.ts", () => ({ signalProcessGroup: signalMock }));
import { runArchiveScript } from "../../src/conversation/core/conversation-archive-script.ts";

const options = {
	chatId: ChatId.make("chat"),
	cwd: "workspace",
	script: 'echo "archive complete"',
	env: { CUSTOM: "value" },
};

describe("archive script host shell", () => {
	let child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
	beforeEach(() => {
		child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
		spawnMock.mockReset().mockReturnValue(child);
		signalMock.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	it.each([
		["win32", "cmd.exe", ["/d", "/s", "/c"], false],
		["linux", "/bin/sh", ["-lc"], true],
		["darwin", "/bin/zsh", ["-lc"], true],
	] as const)("uses the %s execution shell", async (platform, executable, args, detached) => {
		vi.spyOn(process, "platform", "get").mockReturnValue(platform);
		vi.stubEnv("SHELL", "");
		vi.stubEnv("COMSPEC", "");
		vi.stubEnv("ComSpec", "");
		const result = Effect.runPromise(runArchiveScript(options));
		expect(spawnMock).toHaveBeenCalledWith(executable, [...args, options.script], expect.objectContaining({ cwd: options.cwd, detached, env: expect.objectContaining(options.env) }));
		child.stdout.emit("data", "done");
		child.emit("close", 0, null);
		await expect(result).resolves.toEqual({ output: "done" });
	});

	it("reports spawn failure instead of waiting for a close", async () => {
		const result = Effect.runPromise(runArchiveScript(options).pipe(Effect.flip));
		child.emit("error", new Error("shell missing"));
		await expect(result).resolves.toMatchObject({ _tag: "ChatArchiveScriptError", output: "shell missing" });
	});

	it("uses tree cleanup on timeout and reports timeout after close", async () => {
		vi.useFakeTimers();
		const result = Effect.runPromise(runArchiveScript(options).pipe(Effect.flip));
		await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
		expect(signalMock).toHaveBeenCalledWith(child, "SIGKILL");
		child.emit("close", null, "SIGKILL");
		await expect(result).resolves.toMatchObject({ _tag: "ChatArchiveTimeoutError" });
	});
});
