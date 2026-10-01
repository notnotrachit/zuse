import { ArrowDown01Icon, ArrowRight01Icon } from "@zuse/icons/solid-rounded";
import { MoreHorizontal } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import {
	AnchoredMenu,
	type AnchoredMenuItem,
} from "~/components/ui/anchored-menu";
import { HugeIcon } from "~/components/ui/huge-icon";
import { PresenceDot } from "~/components/ui/presence-dot";
import { optionsForConnection } from "~/lib/connection-params";
import type { InboxProjectGroup } from "~/lib/inbox";
import type { ConnectionRecord } from "~/store/connections";
import { colors } from "~/theme";

import { ProjectLogo } from "./project-logo";
import { useProjectAvatarUrl } from "./use-project-avatar";

export function HomeProjectHeader({
	group,
	collapsed,
	connections,
	onToggle,
	nested = false,
	menuItems = [],
}: {
	group: InboxProjectGroup;
	collapsed: boolean;
	connections: ConnectionRecord[];
	onToggle: () => void;
	nested?: boolean;
	menuItems?: readonly AnchoredMenuItem[];
}) {
	const options = useMemo(
		() => optionsForConnection(group.connectionKey, connections),
		[connections, group.connectionKey],
	);
	const avatarUrl = useProjectAvatarUrl({
		connectionKey: group.connectionKey,
		projectId: group.projectId,
		connection: options,
		provisionalUrl: group.avatarUrl,
	});

	return (
		<View
			className="flex-row items-center"
			style={nested ? { marginLeft: 12 } : undefined}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: !collapsed }}
				accessibilityLabel={`${group.title}, ${group.rows.length} chats${
					collapsed ? ", collapsed" : ""
				}`}
				onPress={onToggle}
				accessibilityHint="Tap to expand. Hold and drag to reorder."
				className="min-h-[48px] flex-1 flex-row items-center gap-2.5 rounded-xl overflow-hidden px-2 py-2 active:bg-muted"
			>
				<ProjectLogo title={group.title} avatarUrl={avatarUrl} size={28} />
				<View className="min-w-0 flex-1">
					<View className="flex-row items-center gap-2">
						<Text
							className="min-w-0 shrink font-sans-bold text-[16px] text-foreground"
							numberOfLines={1}
						>
							{group.title}
						</Text>
						{group.activeCount > 0 ? (
							<View className="flex-row items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
								<PresenceDot tone="online" pulse size={6} />
								<Text
									className="font-sans-medium text-[11px] text-muted-foreground"
									style={{ fontVariant: ["tabular-nums"] }}
								>
									{group.activeCount}
								</Text>
							</View>
						) : null}
					</View>
				</View>
				<Text
					className="font-sans text-[13px] text-muted-foreground"
					style={{ fontVariant: ["tabular-nums"] }}
				>
					{group.rows.length}
				</Text>
				<HugeIcon
					icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
					size={16}
					color={colors.tertiaryFg}
				/>
			</Pressable>
			{menuItems.length > 0 ? (
				<AnchoredMenu
					accessibilityLabel={`Actions for ${group.title}`}
					trigger={
						<View className="h-11 w-11 items-center justify-center">
							<MoreHorizontal size={18} color={colors.secondaryFg} />
						</View>
					}
					items={menuItems}
				/>
			) : null}
		</View>
	);
}
