import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = (relativePath: string): string =>
	readFileSync(`${process.cwd()}/src/components/${relativePath}`, "utf8");

describe("iOS native menu compatibility", () => {
	test("does not require HStackView from the installed development client", () => {
		for (const file of [
			"selector-row.ios.tsx",
			"model-mode-menu.ios.tsx",
			"model-sheet.ios.tsx",
		]) {
			expect(source(file)).not.toContain("\tHStack,");
			expect(source(file)).not.toContain("<HStack");
		}
	});

	test("uses supported native label primitives for provider artwork", () => {
		const modelSheet = source("model-sheet.ios.tsx");
		expect(modelSheet).toContain("<Label");
		expect(modelSheet).toContain("assetName={PROVIDER_NATIVE_ASSET_NAMES");
		expect(modelSheet).toContain("seedColor={colors.fg}");
		expect(modelSheet).toContain("padding({ trailing: 6 })");
	});

	test("session actions use the native anchored header menu", () => {
		const sessionActions = source("session-actions-menu.ios.tsx");
		expect(sessionActions).toContain("<Host");
		expect(sessionActions).toContain("<Menu");
		expect(sessionActions).toContain("<NativeButton");
		expect(sessionActions).not.toContain("ActionSheetIOS");
		expect(sessionActions).not.toContain("Stack.Toolbar.Menu");
	});
});

describe("non-iOS chrome is not a no-op stub", () => {
	test("selector, session, model, and composer fallbacks wire handler props", () => {
		expect(source("selector-row.tsx")).toContain("selectorMenuItems");
		expect(source("selector-row.tsx")).toContain("option.onSelect");
		expect(source("session-actions-menu.tsx")).toContain(
			"sessionOverflowItems",
		);
		expect(source("session-actions-menu.tsx")).toContain("onFiles");
		expect(source("session-actions-menu.tsx")).toContain("onTerminal");
		expect(source("session-actions-menu.tsx")).toContain("onOpenOnDesktop");
		expect(source("session-actions-menu.tsx")).not.toContain("_props");
		expect(source("model-sheet.tsx")).toContain("modelSheetModelItems");
		expect(source("model-sheet.tsx")).toContain("onChange");
		expect(source("model-sheet.tsx")).not.toContain("_props");
		expect(source("composer-plus-menu.tsx")).toContain("composerPlusItems");
		expect(source("composer-plus-menu.tsx")).toContain("onCaptureImage");
		expect(source("composer-approval-menu.tsx")).toContain(
			"composerApprovalItems",
		);
		expect(source("composer-approval-menu.tsx")).toContain("onChange");
		expect(source("composer-approval-menu.tsx")).not.toContain("_props");
	});
});
