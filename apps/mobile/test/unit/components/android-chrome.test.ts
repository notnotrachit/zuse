import { describe, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
	Modal: () => null,
	Pressable: () => null,
	Text: () => null,
	View: () => null,
	ScrollView: () => null,
	StyleSheet: { create: (styles: unknown) => styles },
	Platform: {
		OS: "android",
		select: (spec: { android?: unknown; default?: unknown }) =>
			spec.android ?? spec.default,
	},
	DynamicColorIOS: (spec: { light: string }) => spec.light,
}));

vi.mock("lucide-react-native", () => ({
	ChevronsUpDown: () => null,
	MoreHorizontal: () => null,
	Plus: () => null,
	SquarePen: () => null,
}));

vi.mock("~/theme", () => ({
	colors: {
		bg: "#fff",
		fg: "#111",
		secondaryFg: "#666",
		tertiaryFg: "#888",
		accent: "#c8ff00",
	},
}));

vi.mock("expo-router", () => ({
	Color: { android: { dynamic: { surface: "#fff", onSurface: "#111" } } },
}));

import { composerApprovalItems } from "../../../src/components/composer-approval-menu";
import { composerPlusItems } from "../../../src/components/composer-plus-menu";
import { projectPillItems } from "../../../src/components/model-mode-menu";
import {
	ModelSheet,
	modelSheetModelItems,
	modelSheetProviderItems,
	modelSheetRuntimeItems,
} from "../../../src/components/model-sheet";
import {
	SelectorRow,
	selectorMenuItems,
} from "../../../src/components/selector-row";
import {
	SessionActionsMenu,
	sessionOverflowItems,
} from "../../../src/components/session-actions-menu";
import { defaultModelForProvider } from "../../../src/lib/model-options";

const sampleModel = (): {
	providerId: "grok";
	model: string;
	runtimeMode: "approval-required";
	permissionMode: "default";
} => ({
	providerId: "grok",
	model: defaultModelForProvider("grok"),
	runtimeMode: "approval-required",
	permissionMode: "default",
});

describe("non-iOS chrome invokes operator handlers", () => {
	test("SelectorRow options fire onSelect", () => {
		expect(SelectorRow).toBeTypeOf("function");
		const onSelect = vi.fn();
		const items = selectorMenuItems([
			{
				key: "laptop",
				label: "Laptop",
				selected: false,
				onSelect,
			},
		]);
		items.find((item) => item.key === "laptop")?.onPress();
		expect(onSelect).toHaveBeenCalledOnce();
	});

	test("session overflow reaches new chat, files, review, terminal, and handoff", () => {
		expect(SessionActionsMenu).toBeTypeOf("function");
		const onNewChat = vi.fn();
		const onFiles = vi.fn();
		const onChanges = vi.fn();
		const onTerminal = vi.fn();
		const onOpenOnDesktop = vi.fn();
		const items = sessionOverflowItems({
			isPinned: false,
			onNewChat,
			onThreads: vi.fn(),
			onChanges,
			onFiles,
			onTerminal,
			onOpenOnDesktop,
			onArchive: vi.fn(),
		});
		items.find((item) => item.key === "new-chat")?.onPress();
		items.find((item) => item.key === "files")?.onPress();
		items.find((item) => item.key === "changes")?.onPress();
		items.find((item) => item.key === "terminal")?.onPress();
		items.find((item) => item.key === "handoff")?.onPress();
		expect(onNewChat).toHaveBeenCalledOnce();
		expect(onFiles).toHaveBeenCalledOnce();
		expect(onChanges).toHaveBeenCalledOnce();
		expect(onTerminal).toHaveBeenCalledOnce();
		expect(onOpenOnDesktop).toHaveBeenCalledOnce();
	});

	test("model sheet provider, model, and approval choices call onChange", () => {
		expect(ModelSheet).toBeTypeOf("function");
		const onChange = vi.fn();
		const value = sampleModel();
		const providers = modelSheetProviderItems({
			value,
			canChangeProvider: true,
			availableProviders: ["grok", "claude"],
			onChange,
		});
		const models = modelSheetModelItems({ value, onChange });
		const runtimes = modelSheetRuntimeItems({ value, onChange });
		const claude = providers.find((item) => item.key === "claude");
		expect(claude).toBeDefined();
		claude?.onPress();
		expect(onChange).toHaveBeenCalled();
		expect(onChange.mock.calls[0]?.[0]).toMatchObject({ providerId: "claude" });
		onChange.mockClear();
		const otherModel = models.find((item) => item.key !== value.model);
		expect(otherModel).toBeDefined();
		otherModel?.onPress();
		expect(onChange).toHaveBeenCalled();
		expect(onChange.mock.calls[0]?.[0].model).toBe(otherModel?.key);
		onChange.mockClear();
		runtimes.find((item) => item.key === "full-access")?.onPress();
		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({ runtimeMode: "full-access" }),
		);
	});

	test("composer plus and approval menus call the same handlers as iOS", () => {
		const onCaptureImage = vi.fn();
		const onPickImages = vi.fn();
		const onPickFiles = vi.fn();
		const onToggleGoal = vi.fn();
		const onTogglePlan = vi.fn();
		const plus = composerPlusItems({
			goalMode: false,
			goalSupported: true,
			planMode: false,
			onCaptureImage,
			onPickImages,
			onPickFiles,
			onToggleGoal,
			onTogglePlan,
		});
		plus.find((item) => item.key === "camera")?.onPress();
		plus.find((item) => item.key === "photos")?.onPress();
		plus.find((item) => item.key === "files")?.onPress();
		plus.find((item) => item.key === "goal")?.onPress();
		plus.find((item) => item.key === "plan")?.onPress();
		expect(onCaptureImage).toHaveBeenCalledOnce();
		expect(onPickImages).toHaveBeenCalledOnce();
		expect(onPickFiles).toHaveBeenCalledOnce();
		expect(onToggleGoal).toHaveBeenCalledWith(true);
		expect(onTogglePlan).toHaveBeenCalledWith(true);

		const onChange = vi.fn();
		composerApprovalItems("approval-required", onChange)
			.find((item) => item.key === "auto-accept-edits")
			?.onPress();
		expect(onChange).toHaveBeenCalledWith("auto-accept-edits");
	});

	test("project pill options invoke onSelect", () => {
		const onSelect = vi.fn();
		const items = projectPillItems(
			[
				{
					connectionKey: "relay:desk",
					connectionLabel: "Desk",
					projects: [{ id: "p1", name: "zuse", path: "/zuse" }],
				},
			],
			onSelect,
		);
		items[0]?.onPress();
		expect(onSelect).toHaveBeenCalledWith("relay:desk", "p1");
	});
});
