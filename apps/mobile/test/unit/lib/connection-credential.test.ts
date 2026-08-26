import { describe, expect, test } from "vitest";

import { classifyConnectionCredential } from "../../../src/lib/connection-credential";

describe("classifyConnectionCredential", () => {
	test("treats missing credentials as unauthenticated", () => {
		expect(classifyConnectionCredential(undefined)).toEqual({ kind: "none" });
		expect(classifyConnectionCredential("  ")).toEqual({ kind: "none" });
	});

	test("passes issued access tokens directly to the authenticated socket", () => {
		expect(classifyConnectionCredential("  zt_access-token  ")).toEqual({
			kind: "bearer",
			token: "zt_access-token",
		});
	});

	test("normalizes and redeems current short pairing codes", () => {
		expect(classifyConnectionCredential("abcd-efgh")).toEqual({
			kind: "pairing-code",
			code: "ABCDEFGH",
		});
	});

	test("continues to redeem legacy pairing codes", () => {
		expect(classifyConnectionCredential("zp_AbC123xyz")).toEqual({
			kind: "pairing-code",
			code: "zp_AbC123xyz",
		});
	});
});
