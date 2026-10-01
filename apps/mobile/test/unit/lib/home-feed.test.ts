import { describe, expect, it } from "vitest";

import { buildHomeFeed, type HomeFeedItem } from "../../../src/lib/home-feed";
import type { InboxChatRow, InboxProjectGroup } from "../../../src/lib/inbox";
import { DEFAULT_INBOX_GROUP_DISPLAY } from "../../../src/lib/inbox";

const makeRow = (overrides: Partial<InboxChatRow>): InboxChatRow => ({
	key: "chat:conn:chat-1",
	connectionKey: "conn",
	connectionLabel: "Mac",
	projectId: "project-1" as never,
	projectName: "Project",
	projectPath: "/tmp/project",
	chat: null,
	session: { id: "session-1" } as never,
	title: "Chat",
	subtitle: "2m",
	providerModel: "codex / gpt-5.5",
	status: "idle",
	unread: false,
	pinned: false,
	threadCount: 1,
	runningCount: 0,
	threadLabel: "Thread",
	updatedAt: 1000,
	...overrides,
});

const makeGroup = (
	rows: InboxChatRow[],
	overrides: Partial<InboxProjectGroup> = {},
): InboxProjectGroup => ({
	key: "conn:project-1",
	connectionKey: "conn",
	connectionLabel: "Mac",
	projectId: "project-1" as never,
	title: "Project",
	path: "/tmp/project",
	displayPath: "~/project",
	avatarUrl: null,
	rows,
	unreadCount: 0,
	activeCount: 0,
	updatedAt: Math.max(...rows.map((row) => row.updatedAt), 0),
	...overrides,
});

const sections = (feed: HomeFeedItem[]): string[] =>
	feed
		.filter((item) => item.type === "section-header")
		.map((item) => (item.type === "section-header" ? item.title : ""));

const chatsIn = (feed: HomeFeedItem[], context: string): string[] =>
	feed.flatMap((item) =>
		item.type === "chat" && item.context === context ? [item.row.key] : [],
	);

describe("buildHomeFeed", () => {
	const pinned = makeRow({
		key: "chat:conn:pinned",
		title: "Pinned chat",
		pinned: true,
		updatedAt: 500,
	});
	const active = makeRow({
		key: "chat:conn:active",
		title: "Active chat",
		status: "running",
		updatedAt: 900,
	});
	const idle = makeRow({
		key: "chat:conn:idle",
		title: "Idle chat",
		updatedAt: 800,
	});

	it("orders sections Pinned, Active, Projects and omits empty ones", () => {
		const feed = buildHomeFeed({
			groups: [makeGroup([pinned, active, idle])],
			displayStates: new Map(),
			searching: false,
		});
		expect(sections(feed)).toEqual(["Pinned", "Active", "Projects"]);

		const noPinned = buildHomeFeed({
			groups: [makeGroup([active, idle])],
			displayStates: new Map(),
			searching: false,
		});
		expect(sections(noPinned)).toEqual(["Active", "Projects"]);

		const projectsFirst = buildHomeFeed({
			groups: [makeGroup([idle])],
			displayStates: new Map(),
			searching: false,
		});
		expect(sections(projectsFirst)).toEqual(["Projects"]);
		expect(projectsFirst[0]?.type).toBe("section-header");
		expect(projectsFirst[1]?.type).toBe("project-header");
	});

	it("keeps pinned and active shortcuts without a flat recent copy", () => {
		const feed = buildHomeFeed({
			groups: [makeGroup([pinned, active, idle])],
			displayStates: new Map(),
			searching: false,
		});
		expect(chatsIn(feed, "pinned")).toEqual(["chat:conn:pinned"]);
		expect(chatsIn(feed, "active")).toEqual(["chat:conn:active"]);
		expect(chatsIn(feed, "project")).toEqual([
			"chat:conn:pinned",
			"chat:conn:active",
			"chat:conn:idle",
		]);
		const keys = feed.map((item) => item.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("shows every idle chat under its project instead of a recent cap", () => {
		const rows = [1, 2, 3, 4, 5, 6].map((index) =>
			makeRow({ key: `chat:conn:${index}`, updatedAt: index * 100 }),
		);
		const feed = buildHomeFeed({
			groups: [makeGroup(rows)],
			displayStates: new Map(),
			searching: false,
		});
		expect(sections(feed)).toEqual(["Projects"]);
		expect(chatsIn(feed, "project")).toEqual(rows.map((row) => row.key));
	});

	it("nests projects under a named group and hides them when that group is collapsed", () => {
		const alpha = makeGroup([idle], {
			key: "conn:alpha",
			title: "Alpha",
			projectId: "alpha" as never,
		});
		const beta = makeGroup(
			[makeRow({ key: "chat:conn:beta", title: "Beta chat" })],
			{ key: "conn:beta", title: "Beta", projectId: "beta" as never },
		);
		const layout = {
			order: ["group:work"],
			groups: [
				{
					id: "work",
					name: "Work",
					collapsed: false,
					projectKeys: ["conn:alpha"],
				},
			],
		};
		const feed = buildHomeFeed({
			groups: [beta, alpha],
			displayStates: new Map(),
			searching: false,
			layout,
			projectKey: (group) => group.key,
		});
		expect(
			feed.flatMap((item) => {
				if (item.type === "group-header") return [`group:${item.name}`];
				if (item.type === "project-header")
					return [`project:${item.group.title}`];
				if (item.type === "chat" && item.context === "project") {
					return [`chat:${item.row.title}`];
				}
				return [];
			}),
		).toEqual([
			"group:Work",
			"project:Alpha",
			"chat:Idle chat",
			"project:Beta",
			"chat:Beta chat",
		]);

		const work = layout.groups[0];
		if (work === undefined) throw new Error("expected the Work group");
		const collapsed = buildHomeFeed({
			groups: [beta, alpha],
			displayStates: new Map(),
			searching: false,
			layout: {
				...layout,
				groups: [{ ...work, collapsed: true }],
			},
			projectKey: (group) => group.key,
		});
		expect(
			collapsed.flatMap((item) =>
				item.type === "project-header" ? [item.group.title] : [],
			),
		).toEqual(["Beta"]);
		expect(
			collapsed.some(
				(item) =>
					item.type === "chat" &&
					item.row.title === "Idle chat" &&
					item.context === "project",
			),
		).toBe(false);
	});

	it("flattens to the project-grouped result list while searching", () => {
		const feed = buildHomeFeed({
			groups: [makeGroup([pinned, active, idle])],
			displayStates: new Map(),
			searching: true,
		});
		expect(sections(feed)).toEqual([]);
		expect(feed[0]?.type).toBe("project-header");
		expect(chatsIn(feed, "project")).toHaveLength(3);
	});

	it("respects collapsed project groups and show-more math", () => {
		const rows = Array.from({ length: 8 }, (_, index) =>
			makeRow({ key: `chat:conn:${index}`, updatedAt: 1000 - index }),
		);
		const collapsed = buildHomeFeed({
			groups: [makeGroup(rows)],
			displayStates: new Map([
				["conn:project-1", { ...DEFAULT_INBOX_GROUP_DISPLAY, collapsed: true }],
			]),
			searching: false,
		});
		expect(chatsIn(collapsed, "project")).toHaveLength(0);

		const expanded = buildHomeFeed({
			groups: [makeGroup(rows)],
			displayStates: new Map(),
			searching: false,
		});
		const showMore = expanded.find((item) => item.type === "show-more");
		expect(showMore).toMatchObject({ hiddenCount: 2, canShowLess: false });
	});

	it("returns an empty feed for no groups", () => {
		expect(
			buildHomeFeed({ groups: [], displayStates: new Map(), searching: false }),
		).toEqual([]);
	});
});
