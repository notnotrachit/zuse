import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandHome } from "../../src/sources/fs-util.ts";

describe("expandHome", () => {
	it("expands home with either directory separator", () => {
		expect(expandHome("~")).toBe(homedir());
		expect(expandHome("~/logs")).toBe(join(homedir(), "logs"));
		expect(expandHome("~\\logs")).toBe(join(homedir(), "logs"));
	});

	it("leaves ordinary paths and named-user shorthand untouched", () => {
		for (const path of ["logs", "~other/logs", "C:\\logs", "/logs"]) {
			expect(expandHome(path)).toBe(path);
		}
	});
});
