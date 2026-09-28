import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import * as Path from "node:path";

interface LinkFileOptions {
	readonly platform?: NodeJS.Platform;
	readonly filesystem?: Pick<typeof fs, "lstat" | "mkdir" | "symlink" | "copyFile">;
}

const hasCode = (error: unknown, code: string): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	error.code === code;

/**
 * Leave every existing directory entry alone, including dangling symlinks.
 * Symlink creation and COPYFILE_EXCL also protect against concurrent creators.
 * Windows reports missing symlink privileges as EPERM; do not hide other errors.
 * EPERM can also mean an ACL denial, in which case the exclusive copy must itself
 * succeed or propagate its real filesystem error.
 *
 * A copy is a one-time snapshot, never a hardlink: hardlinks stop following the
 * source when an editor atomically replaces it. COPYFILE_EXCL is non-clobbering,
 * but not crash-atomic; staging then renaming would risk overwriting a new target.
 */
export const linkWorktreeFile = async (
	source: string,
	target: string,
	displayPath: string,
	options: LinkFileOptions = {},
): Promise<string> => {
	const filesystem = options.filesystem ?? fs;
	const platform = options.platform ?? process.platform;
	const absoluteSource = Path.resolve(source);
	try {
		await filesystem.lstat(target);
		return "";
	} catch (error) {
		if (!hasCode(error, "ENOENT")) throw error;
	}

	await filesystem.mkdir(Path.dirname(target), { recursive: true });
	try {
		await filesystem.symlink(absoluteSource, target, "file");
		return `linked ${displayPath} -> ${absoluteSource}\n`;
	} catch (error) {
		if (hasCode(error, "EEXIST")) return "";
		if (platform !== "win32" || !hasCode(error, "EPERM")) throw error;
	}

	try {
		await filesystem.copyFile(absoluteSource, target, constants.COPYFILE_EXCL);
	} catch (error) {
		if (hasCode(error, "EEXIST")) return "";
		throw error;
	}
	return `copied ${displayPath} <- ${absoluteSource} (one-time snapshot: Windows denied symlink creation; edits are NOT synchronized, including atomic file replacements). Enable Windows Developer Mode or grant symlink privileges for live links in new worktrees. Existing files are never replaced.\n`;
};
