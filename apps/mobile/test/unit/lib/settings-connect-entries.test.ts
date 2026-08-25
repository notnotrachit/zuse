import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
	nearbyUnavailableLinks,
	settingsConnectEntries,
} from "../../../src/lib/settings-connect-entries";

describe("settings connection entries", () => {
	test("hides nearby when local connectivity is unavailable", () => {
		const rows = settingsConnectEntries(false);
		expect(rows.map((row) => row.id)).toEqual(["scan", "manual"]);
		expect(rows.some((row) => row.id === "nearby")).toBe(false);
		expect(rows.find((row) => row.id === "scan")?.href).toBe("/connect/scan");
		expect(rows.find((row) => row.id === "manual")?.href).toBe(
			"/connect/manual",
		);
	});

	test("keeps nearby when local connectivity is available", () => {
		expect(settingsConnectEntries(true).map((row) => row.id)).toEqual([
			"nearby",
			"scan",
			"manual",
		]);
	});

	test("nearby-unavailable screen still offers QR and manual", () => {
		expect(nearbyUnavailableLinks().map((link) => link.href)).toEqual([
			"/connect/scan",
			"/connect/manual",
		]);
	});

	test("Settings and nearby screens use the shipped entry lists", () => {
		const settings = readFileSync(`${process.cwd()}/app/settings.tsx`, "utf8");
		const nearby = readFileSync(
			`${process.cwd()}/app/connect/nearby.tsx`,
			"utf8",
		);
		expect(settings).toContain(
			"settingsConnectEntries(localConnectivityAvailable)",
		);
		expect(nearby).toContain("nearbyUnavailableLinks()");
	});
});
