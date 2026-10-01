/**
 * Named project groups for the mobile home list. Same idea as the desktop
 * sidebar organizer: a stable order of projects and groups, with each group
 * owning the keys of the projects inside it. Keys are the home list's
 * project identity (`environment` + project id), not display names.
 */

export type ProjectGroupRecord = {
	readonly id: string;
	readonly name: string;
	readonly collapsed: boolean;
	readonly projectKeys: readonly string[];
};

export type ProjectGroupLayout = {
	readonly order: readonly string[];
	readonly groups: readonly ProjectGroupRecord[];
};

export const EMPTY_PROJECT_GROUP_LAYOUT: ProjectGroupLayout = {
	order: [],
	groups: [],
};

export const projectGroupItemKey = (id: string): string => `group:${id}`;

export const projectGroupLayoutsEqual = (
	left: ProjectGroupLayout,
	right: ProjectGroupLayout,
): boolean => {
	if (left === right) return true;
	if (
		left.order.length !== right.order.length ||
		left.groups.length !== right.groups.length
	) {
		return false;
	}
	for (let index = 0; index < left.order.length; index++) {
		if (left.order[index] !== right.order[index]) return false;
	}
	for (let index = 0; index < left.groups.length; index++) {
		const group = left.groups[index];
		const other = right.groups[index];
		if (group === undefined || other === undefined) return false;
		if (
			group.id !== other.id ||
			group.name !== other.name ||
			group.collapsed !== other.collapsed ||
			group.projectKeys.length !== other.projectKeys.length
		) {
			return false;
		}
		for (let keyIndex = 0; keyIndex < group.projectKeys.length; keyIndex++) {
			if (group.projectKeys[keyIndex] !== other.projectKeys[keyIndex]) {
				return false;
			}
		}
	}
	return true;
};

export type ProjectLayoutNode =
	| { readonly kind: "project"; readonly key: string }
	| { readonly kind: "group"; readonly group: ProjectGroupRecord };

const unique = (keys: readonly string[]): string[] => {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const key of keys) {
		if (key.length === 0 || seen.has(key)) continue;
		seen.add(key);
		out.push(key);
	}
	return out;
};

const groupIdFromItem = (item: string): string | null =>
	item.startsWith("group:") ? item.slice("group:".length) : null;

export const parseProjectGroupLayout = (value: unknown): ProjectGroupLayout => {
	if (Array.isArray(value)) {
		return {
			order: unique(
				value.filter(
					(item): item is string =>
						typeof item === "string" && groupIdFromItem(item) === null,
				),
			),
			groups: [],
		};
	}
	if (value === null || typeof value !== "object") {
		return EMPTY_PROJECT_GROUP_LAYOUT;
	}
	const record = value as { order?: unknown; groups?: unknown };
	const order = Array.isArray(record.order)
		? unique(
				record.order.filter((item): item is string => typeof item === "string"),
			)
		: [];
	const groups: ProjectGroupRecord[] = [];
	if (Array.isArray(record.groups)) {
		for (const entry of record.groups) {
			if (entry === null || typeof entry !== "object") continue;
			const group = entry as Record<string, unknown>;
			if (typeof group.id !== "string" || group.id.length === 0) continue;
			if (typeof group.name !== "string" || group.name.trim().length === 0) {
				continue;
			}
			groups.push({
				id: group.id,
				name: group.name.trim(),
				collapsed: group.collapsed === true,
				projectKeys: Array.isArray(group.projectKeys)
					? unique(
							group.projectKeys.filter(
								(key): key is string => typeof key === "string",
							),
						)
					: [],
			});
		}
	}
	return { order, groups };
};

const removeProject = (
	layout: ProjectGroupLayout,
	projectKey: string,
): ProjectGroupLayout => ({
	...layout,
	order: layout.order.filter((key) => key !== projectKey),
	groups: layout.groups.map((group) => ({
		...group,
		projectKeys: group.projectKeys.filter((key) => key !== projectKey),
	})),
});

export const materializeProjectGroups = (
	projectKeys: readonly string[],
	layout: ProjectGroupLayout,
): readonly ProjectLayoutNode[] => {
	const known = new Set(projectKeys);
	const groups = new Map<string, ProjectGroupRecord>();
	for (const group of layout.groups) {
		groups.set(group.id, {
			...group,
			projectKeys: unique(group.projectKeys.filter((key) => known.has(key))),
		});
	}

	const used = new Set<string>();
	const nodes: ProjectLayoutNode[] = [];
	const seenGroups = new Set<string>();
	const pushGroup = (group: ProjectGroupRecord) => {
		if (seenGroups.has(group.id)) return;
		seenGroups.add(group.id);
		for (const key of group.projectKeys) used.add(key);
		nodes.push({ kind: "group", group });
	};

	for (const item of layout.order) {
		const groupId = groupIdFromItem(item);
		if (groupId !== null) {
			const group = groups.get(groupId);
			if (group !== undefined) pushGroup(group);
			continue;
		}
		if (!known.has(item) || used.has(item)) continue;
		used.add(item);
		nodes.push({ kind: "project", key: item });
	}

	for (const group of groups.values()) pushGroup(group);
	for (const key of projectKeys) {
		if (used.has(key)) continue;
		nodes.push({ kind: "project", key });
	}
	return nodes;
};

export const snapshotProjectGroupOrder = (
	projectKeys: readonly string[],
	layout: ProjectGroupLayout,
): ProjectGroupLayout => {
	const nodes = materializeProjectGroups(projectKeys, layout);
	return {
		...layout,
		order: nodes.map((node) =>
			node.kind === "group" ? projectGroupItemKey(node.group.id) : node.key,
		),
		groups: nodes.flatMap((node) =>
			node.kind === "group" ? [node.group] : [],
		),
	};
};

export const createProjectGroup = (
	layout: ProjectGroupLayout,
	input: {
		readonly id: string;
		readonly name: string;
		readonly projectKeys?: readonly string[];
	},
): ProjectGroupLayout => {
	const name = input.name.trim();
	if (name.length === 0 || input.id.length === 0) return layout;
	let next = layout;
	for (const key of input.projectKeys ?? []) next = removeProject(next, key);
	const group: ProjectGroupRecord = {
		id: input.id,
		name,
		collapsed: false,
		projectKeys: unique(input.projectKeys ?? []),
	};
	const itemKey = projectGroupItemKey(group.id);
	return {
		...next,
		order: [itemKey, ...next.order.filter((key) => key !== itemKey)],
		groups: [...next.groups.filter((entry) => entry.id !== group.id), group],
	};
};

export const renameProjectGroup = (
	layout: ProjectGroupLayout,
	groupId: string,
	name: string,
): ProjectGroupLayout => {
	const trimmed = name.trim();
	if (trimmed.length === 0) return layout;
	return {
		...layout,
		groups: layout.groups.map((group) =>
			group.id === groupId ? { ...group, name: trimmed } : group,
		),
	};
};

export const setProjectGroupCollapsed = (
	layout: ProjectGroupLayout,
	groupId: string,
	collapsed: boolean,
): ProjectGroupLayout => ({
	...layout,
	groups: layout.groups.map((group) =>
		group.id === groupId ? { ...group, collapsed } : group,
	),
});

export const dissolveProjectGroup = (
	layout: ProjectGroupLayout,
	groupId: string,
): ProjectGroupLayout => {
	const group = layout.groups.find((entry) => entry.id === groupId);
	if (group === undefined) return layout;
	const itemKey = projectGroupItemKey(groupId);
	const index = layout.order.indexOf(itemKey);
	const order = layout.order.filter((key) => key !== itemKey);
	const nextOrder =
		index < 0
			? [...order, ...group.projectKeys]
			: [...order.slice(0, index), ...group.projectKeys, ...order.slice(index)];
	return {
		...layout,
		order: unique(nextOrder),
		groups: layout.groups.filter((entry) => entry.id !== groupId),
	};
};

export const assignProjectToGroup = (
	layout: ProjectGroupLayout,
	projectKey: string,
	groupId: string | null,
): ProjectGroupLayout => {
	const next = removeProject(layout, projectKey);
	if (groupId === null) {
		return { ...next, order: [...next.order, projectKey] };
	}
	if (!next.groups.some((group) => group.id === groupId)) return layout;
	return {
		...next,
		groups: next.groups.map((group) =>
			group.id === groupId
				? { ...group, projectKeys: [...group.projectKeys, projectKey] }
				: group,
		),
	};
};

const reorderBefore = (
	keys: readonly string[],
	fromKey: string,
	toKey: string,
): string[] => {
	const next = keys.filter((key) => key !== fromKey);
	const index = next.indexOf(toKey);
	if (index < 0) return [...keys];
	next.splice(index, 0, fromKey);
	return next;
};

/** Reorder a project only inside the group (or the top level) it already occupies. */
export const moveProjectWithinContainer = (
	layout: ProjectGroupLayout,
	fromKey: string,
	toKey: string,
): ProjectGroupLayout => {
	if (fromKey === toKey) return layout;
	const fromGroup = layout.groups.find((group) =>
		group.projectKeys.includes(fromKey),
	);
	const toGroup = layout.groups.find((group) =>
		group.projectKeys.includes(toKey),
	);
	if ((fromGroup?.id ?? null) !== (toGroup?.id ?? null)) return layout;
	if (fromGroup !== undefined) {
		return {
			...layout,
			groups: layout.groups.map((group) =>
				group.id === fromGroup.id
					? {
							...group,
							projectKeys: reorderBefore(group.projectKeys, fromKey, toKey),
						}
					: group,
			),
		};
	}
	if (!layout.order.includes(fromKey) || !layout.order.includes(toKey)) {
		return layout;
	}
	return { ...layout, order: reorderBefore(layout.order, fromKey, toKey) };
};
