import { Effect } from "effect";

import { SessionStoreLive } from "../auth/layers/session-store.ts";
import { refreshStoredSession } from "../auth/layers/stored-session-refresh.ts";
import {
	type DeviceAuthorizationGrant,
	pollDeviceAuthorization,
	requestDeviceAuthorization,
} from "../auth/layers/workos-device-auth.ts";
import { SessionStore } from "../auth/services/session-store.ts";

export interface ServeDeviceLoginOptions {
	readonly clientId: string;
	readonly onPrompt: (grant: DeviceAuthorizationGrant) => void | Promise<void>;
}

export const ensureServeSession = (
	options: ServeDeviceLoginOptions,
): Effect.Effect<{ readonly email: string }, Error> =>
	Effect.gen(function* () {
		if (options.clientId.trim().length === 0) {
			return yield* Effect.fail(
				new Error(
					"Zuse Serve authentication is unavailable because WORKOS_CLIENT_ID is not configured.",
				),
			);
		}
		const store = yield* SessionStore;
		const existing = yield* store
			.read()
			.pipe(Effect.mapError((cause) => new Error(cause.reason)));
		if (existing !== null) {
			if (existing.expiresAt - Date.now() > 60_000) {
				return { email: existing.user.email };
			}
			const refreshed = yield* Effect.result(
				refreshStoredSession(store, {
					clientId: options.clientId,
					seed: existing,
					refreshSkewMs: 60_000,
				}),
			);
			if (refreshed._tag === "Success") {
				return { email: refreshed.success.user.email };
			}
			if (
				!(
					refreshed.failure._tag === "AuthTokenError" &&
					(refreshed.failure.code === "invalid_grant" ||
						refreshed.failure.reason === "Signed out during refresh.")
				)
			) {
				return yield* Effect.fail(new Error(refreshed.failure.reason));
			}
		}

		const grant = yield* Effect.tryPromise({
			try: () => requestDeviceAuthorization(options.clientId),
			catch: (cause) =>
				cause instanceof Error ? cause : new Error(String(cause)),
		});
		yield* Effect.tryPromise({
			try: async () => options.onPrompt(grant),
			catch: (cause) =>
				cause instanceof Error ? cause : new Error(String(cause)),
		});
		const session = yield* Effect.tryPromise({
			try: () => pollDeviceAuthorization(options.clientId, grant),
			catch: (cause) =>
				cause instanceof Error ? cause : new Error(String(cause)),
		});
		yield* store
			.withLock(store.write(session))
			.pipe(Effect.mapError((cause) => new Error(cause.reason)));
		return { email: session.user.email };
	}).pipe(Effect.provide(SessionStoreLive));
