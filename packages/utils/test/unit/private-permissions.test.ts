import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensurePrivateDirectory, protectPrivateFile, writePrivateFile } from "../../src/private-permissions.ts";

const directories: string[] = [];
const fixture = async () => {
	const directory = await mkdtemp(join(tmpdir(), "zuse-private-"));
	directories.push(directory);
	return directory;
};
afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("private persistence", () => {
	it("creates nested private directories and atomically replaces secrets", async () => {
		const root = await fixture();
		const directory = join(root, "nested", "secrets");
		const file = join(directory, "token");
		await writePrivateFile(file, "first");
		await writePrivateFile(file, "second");
		expect(await readFile(file, "utf8")).toBe("second");
		if (process.platform !== "win32") {
			expect((await stat(directory)).mode & 0o777).toBe(0o700);
			expect((await stat(file)).mode & 0o777).toBe(0o600);
		}
	});

	it.skipIf(process.platform === "win32")("refuses symbolic-link files and directories", async () => {
		const root = await fixture();
		const target = join(root, "target");
		await writeFile(target, "do not touch", { mode: 0o644 });
		const link = join(root, "link");
		await symlink(target, link);
		await expect(protectPrivateFile(link)).rejects.toThrow();
		const directoryLink = join(root, "directory-link");
		await symlink(root, directoryLink);
		await expect(ensurePrivateDirectory(directoryLink)).rejects.toThrow();
		expect((await stat(target)).mode & 0o777).toBe(0o644);
	});
});
