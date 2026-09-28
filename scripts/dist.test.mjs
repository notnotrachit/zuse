import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runDist } from "./dist.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function harness(results = []) {
	const calls = [];
	const errors = [];
	const env = { NODE_ENV: "development", PATH: "test-path", CUSTOM: "kept" };
	return {
		calls,
		errors,
		env,
		options: {
			env,
			run: (...args) => {
				calls.push(args);
				return results[calls.length - 1] ?? { status: 0 };
			},
			logError: (message) => errors.push(message),
		},
	};
}

test("root distribution scripts use the portable runner without changing targets", () => {
	const { scripts } = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	);
	for (const target of ["mac", "mac:unsigned", "linux", "linux:unsigned"]) {
		assert.equal(scripts[`dist:${target}`], `node scripts/dist.mjs ${target}`);
		const h = harness();
		assert.equal(
			runDist(
				[
					target,
					"--publish",
					"never",
					"-c.extraMetadata.description=with spaces",
				],
				h.options,
			),
			0,
		);
		assert.deepEqual(h.calls, [
			[
				"bun",
				["run", "build:desktop"],
				{
					cwd: resolve(root),
					env: { ...h.env, NODE_ENV: "production" },
					stdio: "inherit",
					shell: false,
				},
			],
			[
				"bun",
				[
					"run",
					`dist:${target}`,
					"--publish",
					"never",
					"-c.extraMetadata.description=with spaces",
				],
				{
					cwd: resolve(root, "apps", "desktop"),
					env: h.env,
					stdio: "inherit",
					shell: false,
				},
			],
		]);
		assert.equal(h.env.NODE_ENV, "development");
	}
});

test("production NODE_ENV is scoped to the build when the parent has none", () => {
	const h = harness();
	delete h.env.NODE_ENV;
	assert.equal(runDist(["linux"], h.options), 0);
	assert.equal(h.calls[0][2].env.NODE_ENV, "production");
	assert.equal(Object.hasOwn(h.calls[1][2].env, "NODE_ENV"), false);
});

test("failed builds prevent packaging; command errors and signals fail", () => {
	for (const [result, expected] of [
		[{ status: 7 }, 7],
		[{ status: null, error: new Error("spawn bun ENOENT") }, 1],
		[{ status: null, signal: "SIGTERM" }, 1],
	]) {
		const h = harness([result]);
		assert.equal(runDist(["linux"], h.options), expected);
		assert.equal(h.calls.length, 1);
	}
});

test("packaging failures preserve the exit status", () => {
	const h = harness([{ status: 0 }, { status: 9 }]);
	assert.equal(runDist(["mac"], h.options), 9);
	assert.equal(h.calls.length, 2);
});

test("Bun entrypoint runs build then packaging with the original environment scope", (t) => {
	const bun = spawnSync("bun", ["--version"], { encoding: "utf8" });
	if (bun.error?.code === "ENOENT") {
		t.skip("Bun is not installed");
		return;
	}
	assert.equal(bun.status, 0);
	const directory = mkdtempSync(join(tmpdir(), "dist-runner-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	mkdirSync(join(directory, "scripts"));
	mkdirSync(join(directory, "apps", "desktop"), { recursive: true });
	copyFileSync(
		new URL("./dist.mjs", import.meta.url),
		join(directory, "scripts", "dist.mjs"),
	);
	writeFileSync(
		join(directory, "record.mjs"),
		`
import { appendFileSync } from "node:fs";
appendFileSync(process.env.TEST_LOG, JSON.stringify({
  step: process.argv[2], env: process.env.NODE_ENV, cwd: process.cwd(), args: process.argv.slice(3)
}) + "\\n");
`,
	);
	writeFileSync(
		join(directory, "package.json"),
		JSON.stringify({
			scripts: {
				"dist:mac": "node scripts/dist.mjs mac",
				"build:desktop": "node record.mjs build",
			},
		}),
	);
	writeFileSync(
		join(directory, "apps", "desktop", "package.json"),
		JSON.stringify({
			scripts: {
				"dist:mac": "node ../../record.mjs package",
			},
		}),
	);
	const logPath = join(directory, "steps.jsonl");
	const result = spawnSync("bun", ["run", "dist:mac", "--publish", "never"], {
		cwd: directory,
		env: { ...process.env, NODE_ENV: "development", TEST_LOG: logPath },
		encoding: "utf8",
		timeout: 10_000,
	});
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(
		readFileSync(logPath, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line)),
		[
			{ step: "build", env: "production", cwd: directory, args: [] },
			{
				step: "package",
				env: "development",
				cwd: join(directory, "apps", "desktop"),
				args: ["--publish", "never"],
			},
		],
	);
});

test("missing or unknown targets do not run commands", () => {
	for (const argv of [[], ["windows"], ["mac && anything"]]) {
		const h = harness();
		assert.equal(runDist(argv, h.options), 1);
		assert.equal(h.calls.length, 0);
		assert.match(h.errors[0], /Usage:/);
	}
});
