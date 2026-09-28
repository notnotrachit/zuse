#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const usage = `Usage:
  bun run kill-port -- <port>
  bun run kill-port -- <port> --force

Examples:
  bun run kill-port -- 5733
  bun run kill-port -- 5733 --force`;

/** @param {string[]} argv */
export function parseArgs(argv) {
	// npm consumes its separator; Bun may forward it to the script.
	const args = argv[0] === "--" ? argv.slice(1) : argv;
	const ports = args.filter((arg) => arg !== "--force");
	const port = Number(ports[0]);
	if (
		ports.length !== 1 ||
		args.length > 2 ||
		!/^\d+$/.test(ports[0]) ||
		!Number.isInteger(port) ||
		port < 1 ||
		port > 65_535
	) {
		throw new Error(usage);
	}
	return { port, force: args.includes("--force") };
}

/**
 * Unlike the application port inspector, this destructive CLI needs individual
 * PID-bearing records, not ports aggregated across processes. Keep it plain JS
 * so Node's supported minimum version needs no TypeScript loader.
 * @param {string} output
 * @param {number} port
 * @param {NodeJS.Platform} platform
 */
export function parseListeners(output, port, platform) {
	const listeners = [];
	for (const line of output.split(/\r?\n/)) {
		const parts = line.trim().split(/\s+/);
		let endpoint;
		let pidText;
		if (platform === "win32") {
			// TCP LocalAddress ForeignAddress State PID (never match the remote port).
			if (parts.length !== 5 || parts[0] !== "TCP" || parts[3] !== "LISTENING")
				continue;
			endpoint = parts[1];
			pidText = parts[4];
		} else {
			// lsof -nP: COMMAND PID ... TCP endpoint (LISTEN)
			if (parts.at(-1) !== "(LISTEN)" || parts.at(-3) !== "TCP") continue;
			endpoint = parts.at(-2);
			pidText = parts[1];
		}
		const localPort = endpoint?.match(/:(\d+)$/)?.[1];
		if (Number(localPort) !== port || !/^\d+$/.test(pidText ?? "")) continue;
		const pid = Number(pidText);
		// Node accepts signed 32-bit PIDs. In particular, never signal PID 0 or
		// a negative PID (process groups on POSIX).
		if (!Number.isInteger(pid) || pid < 0 || pid > 2_147_483_647) continue;
		listeners.push({ pid, line: line.trim() });
	}
	return listeners;
}

/** @param {string[]} argv */
export function runKillPort(
	argv,
	{
		platform = process.platform,
		run = spawnSync,
		kill = process.kill.bind(process),
		log = console.log,
		logError = console.error,
	} = {},
) {
	try {
		const { port, force } = parseArgs(argv);
		const windows = platform === "win32";
		const command = windows ? "netstat.exe" : "lsof";
		const args = windows
			? ["-ano", "-p", "tcp"]
			: ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"];
		const result = run(command, args, {
			encoding: "utf8",
			shell: false,
			windowsHide: true,
			timeout: 10_000,
			maxBuffer: 16 * 1024 * 1024,
		});
		if (result.error)
			throw new Error(`Could not run ${command}: ${result.error.message}`);
		const output = String(result.stdout ?? "").trim();
		const stderr = String(result.stderr ?? "").trim();
		// lsof uses 1 for an empty selection. Missing binaries, permission
		// diagnostics, signals, timeouts and other nonzero exits are failures.
		const noLsofMatch = !windows && result.status === 1 && !output && !stderr;
		if ((result.status !== 0 && !noLsofMatch) || stderr) {
			throw new Error(
				`${command} failed (${result.signal ?? result.status}): ${stderr || output || "no diagnostic output"}`,
			);
		}
		const listeners = parseListeners(output, port, platform);
		if (listeners.length === 0) {
			log(`No listener found on port ${port}.`);
			return 0;
		}
		log(listeners.map(({ line }) => line).join("\n"));
		const pids = [
			...new Set(listeners.map(({ pid }) => pid).filter((pid) => pid > 0)),
		];
		if (pids.length === 0) {
			log(`No killable listener found on port ${port}.`);
			return 0;
		}
		if (!force) {
			log(
				`\nRun with --force to kill ${pids.length === 1 ? "PID" : "PIDs"} ${pids.join(", ")}.`,
			);
			return 0;
		}
		let failed = false;
		for (const pid of pids) {
			try {
				kill(pid, "SIGTERM");
				log(`Sent SIGTERM to PID ${pid}.`);
			} catch (error) {
				if (error.code === "ESRCH") {
					log(`PID ${pid} already exited.`);
				} else {
					failed = true;
					logError(`Could not terminate PID ${pid}: ${error.message}`);
				}
			}
		}
		return failed ? 1 : 0;
	} catch (error) {
		logError(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	process.exitCode = runKillPort(process.argv.slice(2));
}
