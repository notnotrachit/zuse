import { type DragEvent, useMemo, useRef, useState } from "react";
import { useSidebarProjectLayoutStore } from "../store/sidebar-project-layout.ts";
import {
	materializeSidebarLayout,
	projectGroupIdFor,
	type SidebarDragSource,
	type SidebarDropTarget,
	type SidebarLayoutNode,
	sidebarEmptyGroupAcceptsDrop,
	sidebarGroupItemKey,
	sidebarProjectRowAcceptsDrop,
} from "./sidebar-project-layout.ts";

export type SidebarDropLine = "before" | "after" | "into";

export type SidebarGroupDialog =
	| { readonly kind: "create"; readonly projectKeys: ReadonlyArray<string> }
	| {
			readonly kind: "rename";
			readonly groupId: string;
			readonly name: string;
	  };

const itemKeyOf = (node: SidebarLayoutNode): string =>
	node.kind === "group" ? sidebarGroupItemKey(node.group.id) : node.key;

const emptyGroupDropKey = (groupId: string): string => `empty-group:${groupId}`;

export const useSidebarOrganize = (projectKeys: ReadonlyArray<string>) => {
	const layout = useSidebarProjectLayoutStore((s) => s.layout);
	const move = useSidebarProjectLayoutStore((s) => s.move);
	const createGroup = useSidebarProjectLayoutStore((s) => s.createGroup);
	const renameGroup = useSidebarProjectLayoutStore((s) => s.renameGroup);
	const setGroupCollapsed = useSidebarProjectLayoutStore(
		(s) => s.setGroupCollapsed,
	);
	const dissolveGroup = useSidebarProjectLayoutStore((s) => s.dissolveGroup);
	const setGroupIconColor = useSidebarProjectLayoutStore(
		(s) => s.setGroupIconColor,
	);

	const nodes = useMemo(
		() => materializeSidebarLayout(projectKeys, layout),
		[layout, projectKeys],
	);

	const dragSourceRef = useRef<SidebarDragSource | null>(null);
	const skipClickRef = useRef(false);
	const [drop, setDrop] = useState<{
		readonly key: string;
		readonly line: SidebarDropLine;
	} | null>(null);
	const [groupDialog, setGroupDialog] = useState<SidebarGroupDialog | null>(
		null,
	);

	const topAfter = (index: number): SidebarDropTarget => {
		const next = nodes[index + 1];
		return next === undefined
			? { kind: "end" }
			: { kind: "before", itemKey: itemKeyOf(next) };
	};

	const clearDrag = (): void => {
		dragSourceRef.current = null;
		setDrop(null);
	};

	const applyDrop = (target: SidebarDropTarget): void => {
		const source = dragSourceRef.current;
		if (source === null) return;
		move(source, target, projectKeys);
		skipClickRef.current = true;
		clearDrag();
	};

	const consumeSkipClick = (): boolean => {
		if (!skipClickRef.current) return false;
		skipClickRef.current = false;
		return true;
	};

	const projectDragProps = (key: string, groupId: string | null) => {
		const nodeIndex = nodes.findIndex((node) =>
			node.kind === "project"
				? node.key === key
				: node.group.projectKeys.includes(key),
		);
		const node = nodes[nodeIndex];
		const innerIndex =
			node?.kind === "group" ? node.group.projectKeys.indexOf(key) : -1;
		const nextInGroup =
			node?.kind === "group"
				? node.group.projectKeys[innerIndex + 1]
				: undefined;
		const before: SidebarDropTarget =
			groupId === null
				? { kind: "before", itemKey: key }
				: { kind: "group-before", groupId, projectKey: key };
		const after: SidebarDropTarget =
			groupId === null
				? nodeIndex >= 0
					? topAfter(nodeIndex)
					: { kind: "end" }
				: nextInGroup === undefined
					? { kind: "group-end", groupId }
					: {
							kind: "group-before",
							groupId,
							projectKey: nextInGroup,
						};

		return {
			draggable: true,
			onDragStart: (event: DragEvent<HTMLElement>) => {
				dragSourceRef.current = { kind: "project", key };
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", key);
			},
			onDragOver: (event: DragEvent<HTMLElement>) => {
				const source = dragSourceRef.current;
				if (source === null) return;
				if (!sidebarProjectRowAcceptsDrop(source, groupId)) {
					setDrop(null);
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = "move";
				const rect = event.currentTarget.getBoundingClientRect();
				const line: SidebarDropLine =
					event.clientY < rect.top + rect.height / 2 ? "before" : "after";
				setDrop((current) =>
					current?.key === key && current.line === line
						? current
						: { key, line },
				);
			},
			onDrop: (event: DragEvent<HTMLElement>) => {
				const source = dragSourceRef.current;
				if (source === null) return;
				if (!sidebarProjectRowAcceptsDrop(source, groupId)) {
					clearDrag();
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				const rect = event.currentTarget.getBoundingClientRect();
				applyDrop(event.clientY < rect.top + rect.height / 2 ? before : after);
			},
			onDragEnd: () => clearDrag(),
		};
	};

	const emptyGroupDropProps = (groupId: string) => {
		const dropKey = emptyGroupDropKey(groupId);
		return {
			onDragOver: (event: DragEvent<HTMLElement>) => {
				const source = dragSourceRef.current;
				if (source === null || !sidebarEmptyGroupAcceptsDrop(source)) {
					setDrop(null);
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = "move";
				setDrop((current) =>
					current?.key === dropKey && current.line === "into"
						? current
						: { key: dropKey, line: "into" },
				);
			},
			onDrop: (event: DragEvent<HTMLElement>) => {
				const source = dragSourceRef.current;
				if (source === null || !sidebarEmptyGroupAcceptsDrop(source)) {
					clearDrag();
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				applyDrop({ kind: "group-end", groupId });
			},
			onDragLeave: () =>
				setDrop((current) => (current?.key === dropKey ? null : current)),
		};
	};

	const groupDragProps = (id: string) => {
		const itemKey = sidebarGroupItemKey(id);
		const nodeIndex = nodes.findIndex(
			(node) => node.kind === "group" && node.group.id === id,
		);
		return {
			draggable: true,
			onDragStart: (event: DragEvent<HTMLElement>) => {
				dragSourceRef.current = { kind: "group", id };
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", itemKey);
			},
			onDragOver: (event: DragEvent<HTMLElement>) => {
				if (dragSourceRef.current === null) return;
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = "move";
				const rect = event.currentTarget.getBoundingClientRect();
				const y = (event.clientY - rect.top) / rect.height;
				const source = dragSourceRef.current;
				const line: SidebarDropLine =
					source.kind === "project" && y > 0.28 && y < 0.78
						? "into"
						: y < 0.5
							? "before"
							: "after";
				setDrop((current) =>
					current?.key === itemKey && current.line === line
						? current
						: { key: itemKey, line },
				);
			},
			onDrop: (event: DragEvent<HTMLElement>) => {
				event.preventDefault();
				event.stopPropagation();
				const rect = event.currentTarget.getBoundingClientRect();
				const y = (event.clientY - rect.top) / rect.height;
				const source = dragSourceRef.current;
				if (source?.kind === "project" && y > 0.28 && y < 0.78) {
					applyDrop({ kind: "group-end", groupId: id });
					return;
				}
				applyDrop(
					y < 0.5
						? { kind: "before", itemKey }
						: nodeIndex >= 0
							? topAfter(nodeIndex)
							: { kind: "end" },
				);
			},
			onDragEnd: () => clearDrag(),
		};
	};

	const dropLineFor = (key: string): SidebarDropLine | null =>
		drop?.key === key ? drop.line : null;

	return {
		nodes,
		groups: layout.groups,
		dropLineFor,
		projectDragProps,
		groupDragProps,
		emptyGroupDropProps,
		isEmptyGroupDropActive: (groupId: string) =>
			drop?.key === emptyGroupDropKey(groupId) && drop.line === "into",
		consumeSkipClick,
		inGroupId: (projectKey: string) => projectGroupIdFor(layout, projectKey),
		groupDialog,
		setGroupDialog,
		createGroup: (name: string, keys: ReadonlyArray<string>) => {
			createGroup(
				{ id: crypto.randomUUID(), name, projectKeys: keys },
				projectKeys,
			);
		},
		renameGroup,
		setGroupCollapsed,
		dissolveGroup: (groupId: string) => dissolveGroup(groupId, projectKeys),
		addToGroup: (projectKey: string, groupId: string) => {
			move(
				{ kind: "project", key: projectKey },
				{ kind: "group-end", groupId },
				projectKeys,
			);
		},
		removeFromGroup: (projectKey: string) => {
			move({ kind: "project", key: projectKey }, { kind: "end" }, projectKeys);
		},
		sidebarGroupItemKey,
		setGroupIconColor,
	};
};
