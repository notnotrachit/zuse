import { generateKeyPairSync } from "node:crypto";

import { importPKCS8, jwtVerify, SignJWT } from "jose";
import { describe, expect, test } from "vitest";

import { normalizeGithubPrivateKey } from "../../src/cloud-github-app.ts";

describe("GitHub App private keys", () => {
	test("normalizes GitHub's PKCS#1 download for jose", async () => {
		const { privateKey, publicKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
		});
		const githubPem = privateKey.export({
			format: "pem",
			type: "pkcs1",
		}) as string;

		const normalized = normalizeGithubPrivateKey(githubPem);
		expect(normalized).toContain("BEGIN PRIVATE KEY");
		expect(normalized).not.toContain("BEGIN RSA PRIVATE KEY");

		const imported = await importPKCS8(normalized, "RS256");
		const jwt = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer("test-client-id")
			.setExpirationTime("1m")
			.sign(imported);
		await expect(jwtVerify(jwt, publicKey)).resolves.toMatchObject({
			payload: { iss: "test-client-id" },
		});
	});
});
