import {
	Archive,
	Ellipsis,
	Folder,
	GitBranch,
	Laptop,
	Layers,
	Pencil,
	Pin,
	PinOff,
	SquarePen,
	Terminal,
} from "lucide-react-native";
import { Pressable, View } from "react-native";

import {
	AnchoredMenu,
	type AnchoredMenuItem,
} from "~/components/ui/anchored-menu";
import { colors } from "~/theme";

/** Header actions for platforms without the SwiftUI menu. */
export function SessionActionsMenu({
	isPinned,
	onNewChat,
	onPin,
	onRenameChat,
	onRenameSession,
	onRenameBranch,
	onThreads,
	onChanges,
	onFiles,
	onTerminal,
	onOpenOnDesktop,
	onArchive,
}: {
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
}) {
	const items: AnchoredMenuItem[] = [
		...(onPin === undefined
			? []
			: [
					{
						key: "pin",
						label: isPinned ? "Unpin" : "Pin",
						icon: isPinned ? (
							<PinOff size={18} color={colors.fg} />
						) : (
							<Pin size={18} color={colors.fg} />
						),
						onPress: onPin,
					},
				]),
		...(onRenameChat === undefined
			? []
			: [
					{
						key: "rename-chat",
						label: "Rename chat",
						icon: <Pencil size={18} color={colors.fg} />,
						onPress: onRenameChat,
					},
				]),
		...(onRenameSession === undefined
			? []
			: [
					{
						key: "rename-session",
						label: "Rename session",
						icon: <SquarePen size={18} color={colors.fg} />,
						onPress: onRenameSession,
					},
				]),
		...(onRenameBranch === undefined
			? []
			: [
					{
						key: "rename-branch",
						label: "Rename branch",
						icon: <GitBranch size={18} color={colors.fg} />,
						onPress: onRenameBranch,
					},
				]),
		{
			key: "threads",
			label: "Threads",
			icon: <Layers size={18} color={colors.fg} />,
			onPress: onThreads,
		},
		{
			key: "changes",
			label: "Changes",
			icon: <GitBranch size={18} color={colors.fg} />,
			onPress: onChanges,
		},
		{
			key: "files",
			label: "Files",
			icon: <Folder size={18} color={colors.fg} />,
			onPress: onFiles,
		},
		...(onTerminal === undefined
			? []
			: [
					{
						key: "terminal",
						label: "Terminal",
						icon: <Terminal size={18} color={colors.fg} />,
						onPress: onTerminal,
					},
				]),
		...(onOpenOnDesktop === undefined
			? []
			: [
					{
						key: "desktop",
						label: "Open on desktop",
						icon: <Laptop size={18} color={colors.fg} />,
						onPress: onOpenOnDesktop,
					},
				]),
		{
			key: "archive",
			label: "Archive",
			destructive: true,
			icon: <Archive size={18} color={colors.danger} />,
			onPress: onArchive,
		},
	];

	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="New chat"
				hitSlop={8}
				onPress={onNewChat}
				style={{
					width: 40,
					height: 40,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<SquarePen size={20} color={colors.fg} />
			</Pressable>
			<AnchoredMenu
				accessibilityLabel="Chat actions"
				trigger={
					<View className="h-10 w-10 items-center justify-center">
						<Ellipsis size={20} color={colors.fg} />
					</View>
				}
				items={items}
			/>
		</View>
	);
}
