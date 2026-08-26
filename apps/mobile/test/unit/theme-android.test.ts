import { describe, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
	Platform: { OS: "android" },
	DynamicColorIOS: () => {
		throw new Error("DynamicColorIOS is not available on this platform.");
	},
}));

vi.mock("expo-router", () => ({
	Color: {
		android: {
			dynamic: {
				surface: "#111111",
				onSurface: "#eeeeee",
				onSurfaceVariant: "#aaaaaa",
				surfaceContainer: "#222222",
				surfaceContainerHigh: "#333333",
				outlineVariant: "#444444",
				error: "#ff0000",
			},
			material: { yellow600: "#f59e0b" },
		},
	},
}));

describe("Android theme", () => {
	test("does not call DynamicColorIOS when resolving colors", async () => {
		const { colors } = await import("../../src/theme");
		expect(colors.bg).toBe("#111111");
		expect(colors.fg).toBe("#eeeeee");
		expect(colors.accent).toBe("#c8ff00");
	});
});
