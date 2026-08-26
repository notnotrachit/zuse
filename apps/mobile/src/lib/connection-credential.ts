import { normalizePairingCodeInput } from "@zuse/contracts";

export type ConnectionCredential =
	| { readonly kind: "none" }
	| { readonly kind: "bearer"; readonly token: string }
	| { readonly kind: "pairing-code"; readonly code: string };

/**
 * Pairing codes are user-facing, short-lived credentials that must be redeemed
 * before opening the authenticated WebSocket. Only server-issued access tokens
 * use the `zt_` prefix and may be sent directly as bearer credentials.
 */
export const classifyConnectionCredential = (
	value: string | null | undefined,
): ConnectionCredential => {
	const normalized = normalizePairingCodeInput(value ?? "");
	if (normalized.length === 0) return { kind: "none" };
	return normalized.startsWith("zt_")
		? { kind: "bearer", token: normalized }
		: { kind: "pairing-code", code: normalized };
};
