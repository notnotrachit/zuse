import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:os", () => ({ tmpdir: () => "system-temp" }));
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	statSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadPricingTable } from "../../src/pricing/litellm.ts";

afterEach(() => vi.clearAllMocks());

it("uses the OS temporary directory by default", async () => {
	await loadPricingTable({ offline: true });
	expect(existsSync).toHaveBeenCalledWith(
		join("system-temp", "tokenmaxer", "litellm-prices.json"),
	);
});

it("preserves an explicit cache directory", async () => {
	await loadPricingTable({ offline: true, cacheDir: "custom-cache" });
	expect(existsSync).toHaveBeenCalledWith(
		join("custom-cache", "litellm-prices.json"),
	);
	expect(existsSync).not.toHaveBeenCalledWith(
		expect.stringContaining("system-temp"),
	);
});
