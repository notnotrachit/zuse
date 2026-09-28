#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = new Set(["mac", "mac:unsigned", "linux", "linux:unsigned"]);

/**
 * Bun's package-script shell already supports POSIX environment assignments on
 * Windows. This runner also works when invoked through npm/cmd.exe, without
 * changing the original commands or leaking the build's NODE_ENV into packaging.
 * @param {string[]} argv
 */
export function runDist(
	argv,
	{ run = spawnSync, env = process.env, logError = console.error } = {},
) {
	const [target, ...args] = argv;
	if (!targets.has(target)) {
		logError(
			"Usage: node scripts/dist.mjs <mac|mac:unsigned|linux|linux:unsigned> [packaging arguments]",
		);
		return 1;
	}
	const steps = [
		{
			args: ["run", "build:desktop"],
			cwd: repoRoot,
			env: { ...env, NODE_ENV: "production" },
		},
		{
			args: ["run", `dist:${target}`, ...args],
			cwd: resolve(repoRoot, "apps", "desktop"),
			env: { ...env },
		},
	];
	for (const step of steps) {
		const result = run("bun", step.args, {
			cwd: step.cwd,
			env: step.env,
			stdio: "inherit",
			shell: false,
		});
		if (result.error) {
			logError(
				`Could not run bun ${step.args.join(" ")}: ${result.error.message}`,
			);
			return 1;
		}
		if (result.status !== 0) {
			if (result.signal) logError(`bun exited with signal ${result.signal}.`);
			return result.status ?? 1;
		}
	}
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	process.exitCode = runDist(process.argv.slice(2));
}
