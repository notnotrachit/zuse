import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import {
	assignProjectToGroup,
	createProjectGroup,
	dissolveProjectGroup,
	EMPTY_PROJECT_GROUP_LAYOUT,
	moveProjectWithinContainer,
	type ProjectGroupLayout,
	parseProjectGroupLayout,
	projectGroupLayoutsEqual,
	renameProjectGroup,
	setProjectGroupCollapsed,
	snapshotProjectGroupOrder,
} from "~/lib/project-group-layout";

const LEGACY_KEY = "zuse.mobile.project-order.v1";

const layoutPath = () =>
	`${FileSystem.documentDirectory ?? ""}zuse-cache/project-layout.json`;

const readLayout = async (): Promise<ProjectGroupLayout> => {
	try {
		const path = layoutPath();
		const info = await FileSystem.getInfoAsync(path);
		if (info.exists) {
			return parseProjectGroupLayout(
				JSON.parse(await FileSystem.readAsStringAsync(path)),
			);
		}
	} catch {
		// Fall through to the legacy secure-store order.
	}
	try {
		const raw = await SecureStore.getItemAsync(LEGACY_KEY);
		if (raw) return parseProjectGroupLayout(JSON.parse(raw));
	} catch {
		// Missing or unreadable cache just starts from an empty layout.
	}
	return EMPTY_PROJECT_GROUP_LAYOUT;
};

const writeLayout = async (layout: ProjectGroupLayout): Promise<void> => {
	const path = layoutPath();
	const dir = path.slice(0, path.lastIndexOf("/"));
	await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
	await FileSystem.writeAsStringAsync(path, JSON.stringify(layout));
	// The file is the source of truth. Leaving the legacy order in place makes
	// a later unreadable file look like the user never created groups.
	await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
};

export function useProjectLayout() {
	const [layout, setLayout] = useState<ProjectGroupLayout>(
		EMPTY_PROJECT_GROUP_LAYOUT,
	);
	const [ready, setReady] = useState(false);
	const layoutRef = useRef(layout);
	const writes = useRef(Promise.resolve());
	const hydrated = useRef(false);
	const loadToken = useRef(0);
	// Edits that happen before the disk read returns. Replaying them onto the
	// saved layout keeps a fast "New group" from being overwritten, and from
	// writing an empty layout over the saved order.
	const pending = useRef<
		Array<(layout: ProjectGroupLayout) => ProjectGroupLayout>
	>([]);

	const persist = useCallback((next: ProjectGroupLayout) => {
		writes.current = writes.current
			.then(() => writeLayout(next))
			.catch(() => {
				Alert.alert(
					"Groups couldn't be saved",
					"This change will last for this session. Try again to save it.",
				);
			});
	}, []);

	useEffect(() => {
		const token = ++loadToken.current;
		let active = true;
		void readLayout()
			.then((saved) => {
				if (loadToken.current !== token) return;
				const edits = pending.current.splice(0);
				hydrated.current = true;
				const next = edits.reduce((current, edit) => edit(current), saved);
				if (edits.length > 0) persist(next);
				if (!active) return;
				layoutRef.current = next;
				setLayout(next);
			})
			.finally(() => {
				if (active && loadToken.current === token) setReady(true);
			});
		return () => {
			active = false;
		};
	}, [persist]);

	const commit = useCallback(
		(edit: (layout: ProjectGroupLayout) => ProjectGroupLayout) => {
			const next = edit(layoutRef.current);
			if (projectGroupLayoutsEqual(layoutRef.current, next)) return;
			layoutRef.current = next;
			setLayout(next);
			if (!hydrated.current) {
				pending.current.push(edit);
				return;
			}
			persist(next);
		},
		[persist],
	);

	const createGroup = useCallback(
		(name: string, projectKeys: readonly string[] = []) => {
			const id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
			commit((current) =>
				createProjectGroup(current, {
					id,
					name,
					projectKeys,
				}),
			);
			return id;
		},
		[commit],
	);

	const renameGroup = useCallback(
		(id: string, name: string) => {
			commit((current) => renameProjectGroup(current, id, name));
		},
		[commit],
	);

	const dissolveGroup = useCallback(
		(id: string) => {
			commit((current) => dissolveProjectGroup(current, id));
		},
		[commit],
	);

	const toggleCollapsed = useCallback(
		(id: string) => {
			const group = layoutRef.current.groups.find((entry) => entry.id === id);
			if (group === undefined) return;
			const collapsed = !group.collapsed;
			commit((current) => setProjectGroupCollapsed(current, id, collapsed));
		},
		[commit],
	);

	const assignProject = useCallback(
		(projectKey: string, groupId: string | null) => {
			commit((current) => assignProjectToGroup(current, projectKey, groupId));
		},
		[commit],
	);

	const moveWithin = useCallback(
		(projectKeys: readonly string[], fromKey: string, toKey: string) => {
			commit((current) =>
				moveProjectWithinContainer(
					snapshotProjectGroupOrder(projectKeys, current),
					fromKey,
					toKey,
				),
			);
		},
		[commit],
	);

	return {
		layout,
		ready,
		createGroup,
		renameGroup,
		dissolveGroup,
		toggleCollapsed,
		assignProject,
		moveWithin,
	};
}
