import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PtyCommand } from "../../src/pty.ts";

const decode = Schema.decodeUnknownSync(PtyCommand);

describe("PTY command request", () => {
	it.each([
		{ script: 'echo "hello world" && npm run dev', env: { PORT: "3000" } },
		{ cmd: "agent", args: ["--prompt", "hello world"] },
	])("round-trips %j", (request) => {
		expect(decode(JSON.parse(JSON.stringify(request)))).toEqual(request);
	});

	it.each([
		{},
		{ script: "echo hi", cmd: "zsh", args: [] },
		{ script: "echo hi", args: [] },
		{ cmd: "agent" },
	])("rejects incomplete or ambiguous commands %j", (request) => {
		expect(() => decode(request)).toThrow();
	});
});
