import { MoreHorizontal, SquarePen } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { colors } from "~/theme";
import { ActionMenu, type ActionMenuItem } from "./action-menu";

export type SessionActionsMenuProps = {
	isPinned: boolean;
	onNewChat: () => void;
	onPin?: () => void;
	onRenameChat?: () => void;
	onRenameSession?: () => void;
	onRenameBranch?: () => void;
	onThreads: () => void;
	onChanges: () => void;
	onFiles: () => void;
	onTerminal?: () => void;
	onOpenOnDesktop?: () => void;
	onArchive: () => void;
};

export const sessionOverflowItems = (
	props: SessionActionsMenuProps,
): ActionMenuItem[] => {
	const items: ActionMenuItem[] = [
		{ key: "new-chat", label: "New chat", onPress: props.onNewChat },
	];
	if (props.onPin !== undefined) {
		items.push({
			key: "pin",
			label: props.isPinned ? "Unpin" : "Pin",
			onPress: props.onPin,
		});
	}
	if (props.onRenameChat !== undefined) {
		items.push({
			key: "rename-chat",
			label: "Rename chat",
			onPress: props.onRenameChat,
		});
	}
	if (props.onRenameSession !== undefined) {
		items.push({
			key: "rename-session",
			label: "Rename session",
			onPress: props.onRenameSession,
		});
	}
	if (props.onRenameBranch !== undefined) {
		items.push({
			key: "rename-branch",
			label: "Rename branch",
			onPress: props.onRenameBranch,
		});
	}
	items.push(
		{ key: "threads", label: "Threads", onPress: props.onThreads },
		{ key: "changes", label: "Changes", onPress: props.onChanges },
		{ key: "files", label: "Files", onPress: props.onFiles },
	);
	if (props.onTerminal !== undefined) {
		items.push({
			key: "terminal",
			label: "Terminal",
			onPress: props.onTerminal,
		});
	}
	if (props.onOpenOnDesktop !== undefined) {
		items.push({
			key: "handoff",
			label: "Open on desktop",
			onPress: props.onOpenOnDesktop,
		});
	}
	items.push({
		key: "archive",
		label: "Archive",
		destructive: true,
		onPress: props.onArchive,
	});
	return items;
};

export function SessionActionsMenu(props: SessionActionsMenuProps) {
	const [open, setOpen] = useState(false);
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="New chat"
				hitSlop={8}
				onPress={props.onNewChat}
				style={{
					width: 40,
					height: 40,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<SquarePen size={20} color={colors.fg} />
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Chat actions"
				hitSlop={8}
				onPress={() => setOpen(true)}
				style={{
					width: 40,
					height: 40,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<MoreHorizontal size={20} color={colors.fg} />
			</Pressable>
			<ActionMenu
				visible={open}
				title="Chat actions"
				items={sessionOverflowItems(props)}
				onClose={() => setOpen(false)}
			/>
		</View>
	);
}
