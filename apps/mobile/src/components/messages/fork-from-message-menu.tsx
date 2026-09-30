import { GitBranch } from "lucide-react-native";
import { View } from "react-native";

import { AnchoredMenu } from "~/components/ui/anchored-menu";
import { colors } from "~/theme";

/** Non-iOS counterpart of the native message fork menu. */
export function ForkFromMessageMenu({
	onForkInChat,
	onForkInCurrentWorktree,
	onForkInNewWorktree,
}: {
	onForkInChat: () => void;
	onForkInCurrentWorktree: () => void;
	onForkInNewWorktree: () => void;
}) {
	return (
		<AnchoredMenu
			accessibilityLabel="Fork from here"
			trigger={
				<View className="h-9 w-9 items-center justify-center">
					<GitBranch size={16} color={colors.secondaryFg} />
				</View>
			}
			items={[
				{
					key: "chat",
					label: "Fork in this chat",
					onPress: onForkInChat,
				},
				{
					key: "worktree",
					label: "New chat · current worktree",
					onPress: onForkInCurrentWorktree,
				},
				{
					key: "isolated",
					label: "New chat · isolated worktree",
					onPress: onForkInNewWorktree,
				},
			]}
		/>
	);
}
