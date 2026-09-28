import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseArgs, parseListeners, runKillPort } from "./kill-port.mjs";

const windowsOutput = `
Active Connections
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:5733            0.0.0.0:0              LISTENING       123
  TCP    [::]:5733               [::]:0                 LISTENING       123
  TCP    [fe80::1%12]:5733       [::]:0                 LISTENING       456
  TCP    192.168.1.2:5733        0.0.0.0:0              LISTENING       789
  TCP    127.0.0.1:15733         0.0.0.0:0              LISTENING       901
  TCP    127.0.0.1:5555          127.0.0.1:5733         ESTABLISHED     902
  TCP    127.0.0.1:5555          127.0.0.1:5733         LISTENING       903
  TCP    127.0.0.1:5733          127.0.0.1:5555         TIME_WAIT       0
  UDP    0.0.0.0:5733            *:*                                    904
  TCP    127.0.0.1:5733          0.0.0.0:0              LISTENING       -1
  TCP    127.0.0.1:5733          0.0.0.0:0              LISTENING       12x
  TCP    127.0.0.1:5733          0.0.0.0:0              LISTENING       2147483648
  TCP    127.0.0.1:5733          0.0.0.0:0              LISTENING
`;
const lsofOutput = `COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
node 123 user 19u IPv4 12345 0t0 TCP *:5733 (LISTEN)
node 123 user 20u IPv6 12346 0t0 TCP [::1]:5733 (LISTEN)
node 456 user 21u IPv4 12347 0t0 TCP 127.0.0.1:5733 (LISTEN)
node 901 user 22u IPv4 12348 0t0 TCP *:15733 (LISTEN)
node 902 user 23u IPv4 12349 0t0 TCP 127.0.0.1:5555->127.0.0.1:5733 (ESTABLISHED)
node -1 user 24u IPv4 12350 0t0 TCP *:5733 (LISTEN)
`;

function harness(platform = "win32", result = {}) {
	const calls = [];
	const kills = [];
	const logs = [];
	const errors = [];
	const options = {
		platform,
		run: (...args) => {
			calls.push(args);
			return { status: 0, stdout: windowsOutput, stderr: "", ...result };
		},
		kill: (...args) => kills.push(args),
		log: (text) => logs.push(text),
		logError: (text) => errors.push(text),
	};
	return { options, calls, kills, logs, errors };
}

test("accepts valid ports and the optional Bun argument separator", () => {
	for (const port of ["1", "5733", "65535"]) {
		assert.deepEqual(parseArgs([port]), { port: Number(port), force: false });
		assert.deepEqual(parseArgs(["--", port, "--force"]), {
			port: Number(port),
			force: true,
		});
	}
	assert.deepEqual(parseArgs(["--force", "5733"]), { port: 5733, force: true });
});

test("rejects invalid ports/options before inspecting or killing anything", () => {
	for (const args of [
		[],
		[""],
		["0"],
		["65536"],
		["-1"],
		["1.5"],
		["1e3"],
		["0x50"],
		["Infinity"],
		["NaN"],
		[" 80"],
		["80;kill"],
		["80", "81"],
		["80", "--all"],
		["80", "--force", "--force"],
		["--force"],
	]) {
		const h = harness();
		assert.equal(runKillPort(args, h.options), 1, JSON.stringify(args));
		assert.deepEqual(h.calls, []);
		assert.deepEqual(h.kills, []);
		assert.match(h.errors[0], /Usage:/);
	}
});

test("Windows inspection filters exact local TCP listening ports, not remote ports or UDP", () => {
	const h = harness();
	assert.equal(runKillPort(["5733"], h.options), 0);
	assert.equal(h.calls[0][0], "netstat.exe");
	assert.deepEqual(h.calls[0][1], ["-ano", "-p", "tcp"]);
	assert.equal(h.calls[0][2].shell, false);
	assert.deepEqual(h.kills, []);
	assert.match(h.logs.at(-1), /PIDs 123, 456, 789/);
	assert.doesNotMatch(h.logs[0], /15733|901|902|903|904/);
	assert.equal(
		parseListeners(windowsOutput.replaceAll("\n", "\r\n"), 5733, "win32")
			.length,
		4,
	);
});

test("--force signals only deduplicated listener PIDs on the requested port", () => {
	for (const [platform, stdout, expected] of [
		["win32", windowsOutput, [123, 456, 789]],
		["darwin", lsofOutput, [123, 456]],
		["linux", lsofOutput, [123, 456]],
	]) {
		const h = harness(platform, { stdout });
		assert.equal(runKillPort(["--", "5733", "--force"], h.options), 0);
		assert.deepEqual(
			h.kills,
			expected.map((pid) => [pid, "SIGTERM"]),
		);
		if (platform !== "win32") {
			assert.equal(h.calls[0][0], "lsof");
			assert.deepEqual(h.calls[0][1], ["-nP", "-iTCP:5733", "-sTCP:LISTEN"]);
		}
	}
});

test("PID zero is reported but never signaled", () => {
	const h = harness("win32", {
		stdout: "TCP 0.0.0.0:5733 0.0.0.0:0 LISTENING 0",
	});
	assert.equal(runKillPort(["5733", "--force"], h.options), 0);
	assert.match(h.logs.at(-1), /No killable listener/);
	assert.deepEqual(h.kills, []);
});

test("empty netstat and lsof exit 1 without diagnostics mean no listener", () => {
	for (const [platform, status] of [
		["win32", 0],
		["darwin", 1],
		["linux", 1],
	]) {
		const h = harness(platform, { status, stdout: "" });
		assert.equal(runKillPort(["5733", "--force"], h.options), 0);
		assert.deepEqual(h.kills, []);
		assert.match(h.logs[0], /No listener found on port 5733/);
	}
});

test("inspection failures are not misreported as empty ports and never trigger kills", () => {
	for (const platform of ["win32", "darwin", "linux"]) {
		for (const result of [
			{ error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) },
			{ error: Object.assign(new Error("EACCES"), { code: "EACCES" }) },
			{ error: Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }) },
			{ status: 1, stdout: "", stderr: "permission denied" },
			{ status: 2, stdout: "" },
			{ status: null, signal: "SIGTERM", stdout: "" },
			{ status: 0, stderr: "partial inspection failure" },
			{ status: 1, stdout: windowsOutput },
		]) {
			const h = harness(platform, result);
			assert.equal(runKillPort(["5733", "--force"], h.options), 1);
			assert.deepEqual(h.kills, []);
			assert.equal(h.errors.length, 1);
			assert.deepEqual(h.logs, []);
		}
	}
	const h = harness("win32", { status: 1, stdout: "" });
	assert.equal(runKillPort(["5733"], h.options), 1);
});

test("already exited PIDs are benign; permission failures fail without skipping other listeners", () => {
	for (const [code, expected] of [
		["ESRCH", 0],
		["EPERM", 1],
	]) {
		const h = harness();
		h.options.kill = (pid, signal) => {
			h.kills.push([pid, signal]);
			if (pid === 123) throw Object.assign(new Error(code), { code });
		};
		assert.equal(runKillPort(["5733", "--force"], h.options), expected);
		assert.deepEqual(h.kills, [
			[123, "SIGTERM"],
			[456, "SIGTERM"],
			[789, "SIGTERM"],
		]);
	}
});

test("Node CLI entrypoint reports invalid input with nonzero status", () => {
	const result = spawnSync(
		process.execPath,
		[fileURLToPath(new URL("./kill-port.mjs", import.meta.url)), "65536"],
		{ encoding: "utf8" },
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Usage:/);
});
