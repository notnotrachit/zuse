/** Resolve script execution on the execution host, never on the renderer. */
export const shellCommandForPlatform = (
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
): { readonly command: string; readonly args: ReadonlyArray<string> } => {
	if (platform === "win32") {
		return {
			command: env.COMSPEC?.trim() || env.ComSpec?.trim() || "cmd.exe",
			args: ["/d", "/s", "/c"],
		};
	}
	return {
		command:
			env.SHELL?.trim() || (platform === "darwin" ? "/bin/zsh" : "/bin/sh"),
		args: ["-lc"],
	};
};
