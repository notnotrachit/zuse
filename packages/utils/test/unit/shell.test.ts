import { describe, expect, it } from "vitest";
import { shellCommandForPlatform } from "../../src/shell.ts";

describe("execution host shell", () => {
	it.each([
		["win32", {}, "cmd.exe", ["/d", "/s", "/c"]],
		["win32", { SHELL: "/bin/zsh", COMSPEC: " C:\\Windows\\cmd.exe " }, "C:\\Windows\\cmd.exe", ["/d", "/s", "/c"]],
		["win32", { ComSpec: "custom-cmd.exe" }, "custom-cmd.exe", ["/d", "/s", "/c"]],
		["win32", { COMSPEC: "  " }, "cmd.exe", ["/d", "/s", "/c"]],
		["darwin", {}, "/bin/zsh", ["-lc"]],
		["linux", {}, "/bin/sh", ["-lc"]],
		["linux", { SHELL: " /usr/bin/fish " }, "/usr/bin/fish", ["-lc"]],
		["linux", { SHELL: " " }, "/bin/sh", ["-lc"]],
	] as const)("resolves %s with %j", (platform, env, command, args) => {
		expect(shellCommandForPlatform(platform, env)).toEqual({ command, args });
	});
});
