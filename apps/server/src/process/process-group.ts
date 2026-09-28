import { type ChildProcess, spawn } from "node:child_process";
import { shellCommandForPlatform } from "@zuse/utils/shell";

/** Self-contained so the watchdog can use exactly the same Windows cleanup. */
function terminateWindowsTree(
	pid: number,
	spawnProcess: typeof spawn,
	fallback: () => void,
	done: () => void,
): void {
	let finished = false;
	const finish = (error?: unknown) => {
		if (finished) return;
		finished = true;
		if (error !== undefined) {
			console.error(`Process tree cleanup failed for ${pid}: ${String(error)}`);
			try {
				fallback();
			} catch (fallbackError) {
				console.error(`Process cleanup fallback failed: ${String(fallbackError)}`);
			}
		}
		done();
	};
	try {
		const killer = spawnProcess("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
			windowsHide: true,
			stdio: "ignore",
			timeout: 5_000,
			killSignal: "SIGKILL",
		});
		killer.once("error", finish);
		killer.once("close", (code) =>
			finish(code === 0 ? undefined : new Error(`taskkill exited with code ${code}`)),
		);
	} catch (error) {
		finish(error);
	}
}

/** Signal a POSIX group or terminate a Windows tree, tolerating already-dead children. */
export const signalProcessGroup = (
	child: ChildProcess,
	signal: NodeJS.Signals,
): void => {
	if (child.pid === undefined || child.pid <= 0) return;
	const fallback = () => {
		try {
			child.kill(signal);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
				console.error(`Process cleanup failed for ${child.pid}: ${String(error)}`);
			}
		}
	};
	if (process.platform === "win32") {
		terminateWindowsTree(child.pid, spawn, fallback, () => {});
		return;
	}
	try {
		process.kill(-child.pid, signal);
	} catch {
		fallback();
	}
};

export const SUPERVISED_COMMAND_LEASE_MS = 15_000;

// POSIX commands share the supervisor's process group. Windows has no group
// signals: stop the command tree with taskkill before exiting the supervisor.
const SUPERVISOR = `
const { spawn } = require('node:child_process');
const terminateWindowsTree = ${terminateWindowsTree.toString()};
const [shell, argsJson, initialDeadline] = process.argv.slice(1);
let deadline = Number(initialDeadline);
let input = "";
let child;
let stopping = false;
const stop = () => {
 if (stopping) return;
 stopping = true;
 if (process.platform === 'win32') {
  if (!child || !child.pid) { process.exit(1); return; }
  terminateWindowsTree(child.pid, spawn, () => child.kill('SIGKILL'), () => process.exit(1));
 } else {
  try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); }
 }
};
const watchdog = setInterval(() => { if (!Number.isFinite(deadline) || Date.now() >= deadline) stop(); }, 250);
process.stdin.on('data', chunk => {
 input += chunk.toString('utf8');
 let end;
 while ((end = input.indexOf('\\n')) >= 0) {
  deadline = Math.min(Number(input.slice(0, end)), Date.now() + ${SUPERVISED_COMMAND_LEASE_MS});
  input = input.slice(end + 1);
 }
 if (input.length > 64) stop();
});
process.stdin.resume();
process.stdin.once('end', stop);
process.stdin.once('error', stop);
if (!Number.isFinite(deadline) || Date.now() >= deadline) {
 stop();
} else {
 child = spawn(shell, JSON.parse(argsJson), { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
 child.once('error', error => { console.error(error.message); process.exit(127); });
 child.once('exit', code => {
  if (stopping) return;
  clearInterval(watchdog);
  process.exitCode = code ?? 1;
  process.stdin.pause();
  process.stdin.destroy();
 });
}
`;
export const spawnSupervisedCommand = (
	command: string,
	cwd: string,
	deadline = Date.now() + SUPERVISED_COMMAND_LEASE_MS,
): ChildProcess => {
	const shell = shellCommandForPlatform(process.platform, process.env);
	return spawn(
		process.execPath,
		[
			"-e",
			SUPERVISOR,
			shell.command,
			JSON.stringify([...shell.args, command]),
			String(deadline),
		],
		{
			cwd,
			detached: process.platform !== "win32",
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		},
	);
};
