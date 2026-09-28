import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve, win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Windows PowerShell 5.1 / .NET Framework supports creating a directory with a
 * security descriptor in the creation call. Do not replace this with mkdir then
 * icacls: that exposes a writable directory before its ACL is restricted.
 * Paths travel as environment data, never PowerShell source. Identity comes
 * from the access token, not USERNAME (nor localized account/group names).
 */
export const WINDOWS_PRIVATE_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$p = $env:ZUSE_PRIVATE_PATH
$isDirectory = $env:ZUSE_PRIVATE_KIND -eq 'directory'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
if ($null -eq $sid) { throw 'No current user SID' }
if ($isDirectory) {
  $security = New-Object System.Security.AccessControl.DirectorySecurity
  $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
} else {
  $security = New-Object System.Security.AccessControl.FileSecurity
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
}
$security.SetOwner($sid)
$security.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
$security.AddAccessRule($rule)
if ($isDirectory -and -not [System.IO.Directory]::Exists($p)) {
  [System.IO.Directory]::CreateDirectory($p, $security) | Out-Null
}
$attributes = [System.IO.File]::GetAttributes($p)
if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing reparse point' }
if ((($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) -ne $isDirectory) { throw 'Unexpected path type' }
if ($isDirectory) {
  [System.IO.Directory]::SetAccessControl($p, $security)
  $actual = [System.IO.Directory]::GetAccessControl($p)
} else {
  [System.IO.File]::SetAccessControl($p, $security)
  $actual = [System.IO.File]::GetAccessControl($p)
}
if (-not $actual.AreAccessRulesProtected) { throw 'ACL inheritance is enabled' }
if ($actual.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Unexpected owner' }
$rules = @($actual.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ($rules.Count -ne 1) { throw 'Unexpected ACL entries' }
$r = $rules[0]
if ($r.IdentityReference.Value -ne $sid.Value -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl -or $r.IsInherited -or $r.InheritanceFlags -ne $inheritance -or $r.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None) { throw 'Private ACL verification failed' }
`;

const windowsPrivatePermissions = async (
	path: string,
	kind: "file" | "directory",
): Promise<void> => {
	const systemRoot = process.env.SystemRoot;
	if (!systemRoot || !win32.isAbsolute(systemRoot)) {
		throw new Error("Cannot locate Windows PowerShell for private storage");
	}
	await execFileAsync(
		win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
		["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(WINDOWS_PRIVATE_ACL_SCRIPT, "utf16le").toString("base64")],
		{
			windowsHide: true,
			timeout: 30_000,
			maxBuffer: 64 * 1024,
			env: { ...process.env, ZUSE_PRIVATE_PATH: resolve(path), ZUSE_PRIVATE_KIND: kind },
		},
	);
};

const assertPathType = async (path: string, directory: boolean): Promise<void> => {
	const info = await lstat(path);
	if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || (!directory && info.nlink !== 1)) {
		throw new Error(`Refusing non-private path type: ${path}`);
	}
};

/** Existing ancestors must be trusted (not writable by other unprivileged users).
 * Does not recursively change unrelated existing ancestors or child ACLs.
 */
export const ensurePrivateDirectory = async (path: string): Promise<void> => {
	const absolute = resolve(path);
	try {
		await assertPathType(absolute, true);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
		const parent = dirname(absolute);
		if (parent === absolute) throw cause;
		try {
			await assertPathType(parent, true);
		} catch (parentCause) {
			if ((parentCause as NodeJS.ErrnoException).code !== "ENOENT") throw parentCause;
			await ensurePrivateDirectory(parent);
		}
		if (process.platform !== "win32") {
			try {
				await mkdir(absolute, { mode: 0o700 });
			} catch (mkdirCause) {
				if ((mkdirCause as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirCause;
			}
			await assertPathType(absolute, true);
		}
	}
	if (process.platform === "win32") {
		await windowsPrivatePermissions(absolute, "directory");
	} else {
		await chmod(absolute, 0o700);
	}
};

/** Call before reading existing secrets. Permission failures are never ignored. */
export const protectPrivateFile = async (path: string): Promise<void> => {
	await assertPathType(path, false);
	if (process.platform === "win32") {
		await windowsPrivatePermissions(path, "file");
	} else {
		await chmod(path, 0o600);
	}
};

/**
 * Secure the parent, exclusively create an EMPTY temporary file, secure/verify
 * its ACL, and only then write secret bytes. Rename preserves the protected ACL.
 * No secret is written after a permission error; no broad-ACL fallback exists.
 * This is not a defence against administrators or a hostile same-user process.
 */
export const writePrivateFile = async (path: string, contents: string | Uint8Array): Promise<void> => {
	await ensurePrivateDirectory(dirname(path));
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	const handle = await open(temporary, "wx", 0o600);
	try {
		await protectPrivateFile(temporary);
		await handle.writeFile(contents);
		await handle.sync();
	} catch (cause) {
		await handle.close();
		await rm(temporary, { force: true });
		throw cause;
	}
	await handle.close();
	try {
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
};
