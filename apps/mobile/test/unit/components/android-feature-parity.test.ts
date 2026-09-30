import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = (relativePath: string): string =>
	readFileSync(`${process.cwd()}/${relativePath}`, "utf8");

describe("android feature parity", () => {
	test("composer menus expose the same actions as iOS", () => {
		const plus = source("src/components/composer-plus-menu.tsx");
		const approval = source("src/components/composer-approval-menu.tsx");
		for (const label of [
			"Take photo",
			"Choose photos",
			"Choose files",
			"Add goal",
			"Plan mode",
		]) {
			expect(plus).toContain(label);
		}
		expect(plus).toContain("onCaptureImage");
		expect(plus).toContain("onPickImages");
		expect(plus).toContain("onPickFiles");
		expect(plus).toContain("onToggleGoal");
		expect(plus).toContain("onTogglePlan");
		expect(plus).not.toContain("onPress={props.onPickFiles}");
		expect(approval).toContain("RUNTIME_OPTIONS");
		expect(approval).toContain("onChange(option.value)");
		expect(approval).not.toContain("return null");
	});

	test("session actions and selectors stay interactive", () => {
		const actions = source("src/components/session-actions-menu.tsx");
		const selector = source("src/components/selector-row.tsx");
		for (const label of [
			"Unpin",
			"Pin",
			"Rename chat",
			"Rename session",
			"Rename branch",
			"Threads",
			"Changes",
			"Files",
			"Terminal",
			"Open on desktop",
			"Archive",
		]) {
			expect(actions).toContain(`"${label}"`);
		}
		expect(actions).toContain('accessibilityLabel="New chat"');
		expect(actions).not.toContain("return null");
		expect(selector).toContain("option.onSelect");
		expect(selector).toContain("AnchoredMenu");
	});

	test("model sheet can change provider, model, intelligence, and approval", () => {
		const sheet = source("src/components/model-sheet.tsx");
		expect(sheet).toContain('title="Model"');
		expect(sheet).toContain('label="Provider"');
		expect(sheet).toContain('label="Model"');
		expect(sheet).toContain('label="Intelligence"');
		expect(sheet).toContain('label="Approval"');
		expect(sheet).toContain("defaultModelOptions");
		expect(sheet).toContain("RUNTIME_OPTIONS");
		expect(sheet).not.toContain("return null");
	});

	test("fork menu offers the same destinations as iOS", () => {
		const menu = source("src/components/messages/fork-from-message-menu.tsx");
		expect(menu).toContain("Fork in this chat");
		expect(menu).toContain("onForkInCurrentWorktree");
		expect(menu).toContain("onForkInNewWorktree");
		expect(menu).toContain("AnchoredMenu");
	});

	test("android config enables local networking and nearby discovery", () => {
		const app = JSON.parse(source("app.json")) as {
			expo: {
				plugins?: string[];
				android?: {
					package?: string;
					permissions?: string[];
				};
			};
		};
		const moduleConfig = JSON.parse(
			source("modules/local-connectivity/expo-module.config.json"),
		) as { platforms: string[] };
		const platformConfig = JSON.parse(
			source("modules/mobile-platform/expo-module.config.json"),
		) as { platforms: string[] };
		const manifest = source(
			"modules/local-connectivity/android/src/main/AndroidManifest.xml",
		);
		const plugin = source("plugins/with-android-local-network.js");
		expect(app.expo.android?.package).toBe("com.zuse.sh");
		expect(app.expo.plugins).toContain("./plugins/with-android-local-network");
		expect(plugin).toContain('["android:usesCleartextTraffic"] = "true"');
		expect(app.expo.android?.permissions).toContain(
			"android.permission.CAMERA",
		);
		expect(manifest).toContain("android.permission.NEARBY_WIFI_DEVICES");
		expect(manifest).toContain(
			'android:usesPermissionFlags="neverForLocation"',
		);
		expect(manifest).toContain("android.permission.ACCESS_FINE_LOCATION");
		expect(moduleConfig.platforms).toContain("android");
		expect(platformConfig.platforms).toContain("android");
		expect(
			source("modules/local-connectivity/src/ZuseLocalConnectivityModule.ts"),
		).toContain("NEARBY_WIFI_DEVICES");
		expect(source("modules/mobile-platform/src/mobile-platform.ts")).toContain(
			"shareLocalFile",
		);
	});
});
