import { Chat, Folder, Session } from "@zuse/contracts";
import { Schema } from "effect";

/** JSON dates must be decoded before cached entities enter the application store. */
export const SessionsSnapshot = Schema.Struct({
	projects: Schema.Array(Folder),
	chats: Schema.Array(Chat),
	sessions: Schema.Array(Session),
	savedAt: Schema.Number,
});
export type SessionsSnapshot = typeof SessionsSnapshot.Type;

/**
 * Optimistic edits spread class instances into plain objects (`{ ...chat }`).
 * `Schema.encodeSync` then rejects them with "Expected Chat" even when every
 * field is valid. Rebuild the instance when that happens; leave rows that
 * cannot be rebuilt untouched so the caller still sees the original failure.
 */
const rehydrate = <A>(
	isInstance: (value: A) => boolean,
	make: (value: A) => A,
	value: A,
): A => {
	if (isInstance(value)) return value;
	try {
		return make(value);
	} catch {
		return value;
	}
};

export const encodeSessionsSnapshot = (snapshot: SessionsSnapshot) =>
	Schema.encodeSync(SessionsSnapshot)({
		savedAt: snapshot.savedAt,
		projects: snapshot.projects.map((project) =>
			rehydrate(
				(value) => Schema.is(Folder)(value),
				(value) => Folder.make(value),
				project,
			),
		),
		chats: snapshot.chats.map((chat) =>
			rehydrate(
				(value) => Schema.is(Chat)(value),
				(value) => Chat.make(value),
				chat,
			),
		),
		sessions: snapshot.sessions.map((session) =>
			rehydrate(
				(value) => Schema.is(Session)(value),
				(value) => Session.make(value),
				session,
			),
		),
	});
