import { AgentSessionId, Chat, ChatId, FolderId } from "@zuse/contracts";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
	encodeSessionsSnapshot,
	SessionsSnapshot,
} from "../../../src/offline/sessions-snapshot";

describe("encodeSessionsSnapshot", () => {
	it("encodes a chat that lost its class identity", () => {
		const chat = Chat.make({
			id: ChatId.make("chat_c7b70666-09e1-47df-b45d-2ce03d2a9e73"),
			projectId: FolderId.make("ffafdb6f-7f58-4d46-ae43-e17a189e9812"),
			worktreeId: null,
			title: "Payments supabase auth",
			titleProvenance: "manual",
			activeSessionId: AgentSessionId.make(
				"s_2ad15fbc-da6b-4530-8e76-f0e9d61dd598",
			),
			originSessionId: null,
			archivedAt: null,
			lastMessageAt: new Date("2026-08-23T07:51:12.349Z"),
			lastReadAt: new Date("2026-09-30T20:32:27.549Z"),
			createdAt: new Date("2026-08-18T07:56:07.499Z"),
			updatedAt: new Date("2026-08-18T08:08:06.836Z"),
		});
		const plain = { ...chat, title: "Renamed locally" };
		expect(Schema.is(Chat)(plain)).toBe(false);
		const encoded = encodeSessionsSnapshot({
			projects: [],
			chats: [plain as Chat],
			sessions: [],
			savedAt: 1,
		});
		expect(encoded.chats[0]?.title).toBe("Renamed locally");
		const decoded = Schema.decodeUnknownSync(SessionsSnapshot)(encoded);
		expect(Schema.is(Chat)(decoded.chats[0])).toBe(true);
		expect(decoded.chats[0]?.title).toBe("Renamed locally");
	});
});
