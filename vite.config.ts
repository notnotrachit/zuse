import { defineConfig } from "vite-plus";

// Workspace-wide Vite+ entry point. Application-specific runtime and pack
// configuration stays alongside each application where paths and targets differ.
export default defineConfig({
	assetsInclude: ["**/*.sh"],
	plugins: [
		{
			name: "raw-shell-modules",
			enforce: "pre",
			transform(source, id) {
				return id.endsWith(".sh")
					? { code: `export default ${JSON.stringify(source)}`, map: null }
					: null;
			},
		},
	],
});
