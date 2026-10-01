import {
	buildInboxListItems,
	type InboxChatRow,
	type InboxGroupDisplayState,
	type InboxProjectGroup,
} from "./inbox";
import {
	EMPTY_PROJECT_GROUP_LAYOUT,
	materializeProjectGroups,
	type ProjectGroupLayout,
} from "./project-group-layout";

export type HomeChatContext = "pinned" | "active" | "project";

export type HomeFeedSection = "Pinned" | "Active" | "Projects";

export type HomeFeedItem =
	| {
			type: "section-header";
			key: string;
			title: HomeFeedSection;
	  }
	| {
			type: "chat";
			key: string;
			row: InboxChatRow;
			context: HomeChatContext;
			/** Whether this chat row shows the project identity inline. */
			showProject: boolean;
			isFirst: boolean;
			isLast: boolean;
			nested: boolean;
	  }
	| {
			type: "group-header";
			key: string;
			id: string;
			name: string;
			projectCount: number;
			collapsed: boolean;
	  }
	| {
			type: "group-empty";
			key: string;
			groupId: string;
	  }
	| {
			type: "project-header";
			key: string;
			group: InboxProjectGroup;
			collapsed: boolean;
			nested: boolean;
			/** "root" or the user-group id this project currently lives in. */
			containerKey: string;
	  }
	| {
			type: "show-more";
			key: string;
			groupKey: string;
			hiddenCount: number;
			canShowLess: boolean;
			nested: boolean;
	  };

const isActive = (row: InboxChatRow): boolean =>
	row.status === "running" || row.status === "booting";

const byUpdatedAt = (a: InboxChatRow, b: InboxChatRow): number =>
	b.updatedAt - a.updatedAt || a.title.localeCompare(b.title);

const flatSection = (
	title: Exclude<HomeFeedSection, "Projects">,
	context: HomeChatContext,
	rows: readonly InboxChatRow[],
): HomeFeedItem[] => {
	if (rows.length === 0) return [];
	return [
		{ type: "section-header", key: `section:${title}`, title },
		...rows.map(
			(row, index): HomeFeedItem => ({
				type: "chat",
				key: `${context}:${row.key}`,
				row,
				context,
				showProject: true,
				isFirst: index === 0,
				isLast: index === rows.length - 1,
				nested: false,
			}),
		),
	];
};

const projectBlock = (
	group: InboxProjectGroup,
	displayStates: ReadonlyMap<string, InboxGroupDisplayState>,
	nested: boolean,
	containerKey: string,
	searching: boolean,
): HomeFeedItem[] =>
	buildInboxListItems({
		groups: [group],
		displayStates,
		searching,
	}).map((item): HomeFeedItem => {
		if (item.type === "header") {
			return {
				type: "project-header",
				key: item.key,
				group: item.group,
				collapsed: item.collapsed,
				nested,
				containerKey,
			};
		}
		if (item.type === "chat") {
			return {
				type: "chat",
				key: `project:${item.key}`,
				row: item.row,
				context: "project",
				showProject: false,
				isFirst: false,
				isLast: item.isLast,
				nested,
			};
		}
		return { ...item, nested };
	});

/**
 * Home feed: pinned and running chats first, then project groups as the
 * primary list. Idle chats are not copied into a Recent section — that list
 * pushed every project below the fold. Named groups wrap projects. Searching
 * drops the shortcuts and shows matches under their project.
 */
export const buildHomeFeed = ({
	groups,
	displayStates,
	searching,
	layout = EMPTY_PROJECT_GROUP_LAYOUT,
	projectKey = (group) => group.key,
}: {
	groups: readonly InboxProjectGroup[];
	displayStates: ReadonlyMap<string, InboxGroupDisplayState>;
	searching: boolean;
	layout?: ProjectGroupLayout;
	projectKey?: (group: InboxProjectGroup) => string;
}): HomeFeedItem[] => {
	if (searching) {
		return groups.flatMap((group) =>
			projectBlock(group, displayStates, false, "root", true),
		);
	}

	const byKey = new Map(groups.map((group) => [projectKey(group), group]));
	const nodes = materializeProjectGroups([...byKey.keys()], layout);
	const projectItems: HomeFeedItem[] = [];
	for (const node of nodes) {
		if (node.kind === "group") {
			projectItems.push({
				type: "group-header",
				key: `user-group:${node.group.id}`,
				id: node.group.id,
				name: node.group.name,
				projectCount: node.group.projectKeys.length,
				collapsed: node.group.collapsed,
			});
			if (node.group.collapsed) continue;
			if (node.group.projectKeys.length === 0) {
				projectItems.push({
					type: "group-empty",
					key: `user-group-empty:${node.group.id}`,
					groupId: node.group.id,
				});
				continue;
			}
			for (const key of node.group.projectKeys) {
				const group = byKey.get(key);
				if (group === undefined) continue;
				projectItems.push(
					...projectBlock(group, displayStates, true, node.group.id, false),
				);
			}
			continue;
		}
		const group = byKey.get(node.key);
		if (group === undefined) continue;
		projectItems.push(
			...projectBlock(group, displayStates, false, "root", false),
		);
	}

	const allRows = groups.flatMap((group) => group.rows);
	const pinned = allRows.filter((row) => row.pinned).sort(byUpdatedAt);
	const active = allRows
		.filter((row) => !row.pinned && isActive(row))
		.sort(byUpdatedAt);

	const items: HomeFeedItem[] = [
		...flatSection("Pinned", "pinned", pinned),
		...flatSection("Active", "active", active),
	];
	if (projectItems.length > 0) {
		items.push({
			type: "section-header",
			key: "section:Projects",
			title: "Projects",
		});
		items.push(...projectItems);
	}
	return items;
};
