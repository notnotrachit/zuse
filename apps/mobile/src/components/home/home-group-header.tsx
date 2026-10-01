import {
	ArrowDown01Icon,
	ArrowRight01Icon,
	Folder01Icon,
} from "@zuse/icons/solid-rounded";
import { MoreHorizontal } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { AnchoredMenu } from "~/components/ui/anchored-menu";
import { HugeIcon } from "~/components/ui/huge-icon";
import { selectionTap } from "~/lib/haptics";
import { colors } from "~/theme";

export function HomeGroupHeader({
	name,
	projectCount,
	collapsed,
	onToggle,
	onRename,
	onDissolve,
}: {
	name: string;
	projectCount: number;
	collapsed: boolean;
	onToggle: () => void;
	onRename: () => void;
	onDissolve: () => void;
}) {
	return (
		<View className="mt-1 flex-row items-center">
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: !collapsed }}
				accessibilityLabel={`${name}, ${projectCount} projects${collapsed ? ", collapsed" : ""}`}
				onPress={() => {
					selectionTap();
					onToggle();
				}}
				className="min-h-[48px] flex-1 flex-row items-center gap-2.5 rounded-xl px-2 py-2 active:bg-muted"
			>
				<HugeIcon icon={Folder01Icon} size={18} color={colors.secondaryFg} />
				<Text
					className="min-w-0 flex-1 font-sans-bold text-[16px] text-foreground"
					numberOfLines={1}
				>
					{name}
				</Text>
				<Text
					className="font-sans text-[13px] text-muted-foreground"
					style={{ fontVariant: ["tabular-nums"] }}
				>
					{projectCount}
				</Text>
				<HugeIcon
					icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
					size={16}
					color={colors.tertiaryFg}
				/>
			</Pressable>
			<AnchoredMenu
				accessibilityLabel={`Actions for ${name}`}
				trigger={
					<View className="h-11 w-11 items-center justify-center">
						<MoreHorizontal size={18} color={colors.secondaryFg} />
					</View>
				}
				items={[
					{ key: "rename", label: "Rename group", onPress: onRename },
					{
						key: "dissolve",
						label: "Ungroup",
						destructive: true,
						onPress: onDissolve,
					},
				]}
			/>
		</View>
	);
}
