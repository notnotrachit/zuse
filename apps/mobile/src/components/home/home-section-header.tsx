import { Pressable, Text, View } from "react-native";

import type { HomeFeedSection } from "~/lib/home-feed";

export function HomeSectionHeader({
	title,
	actionLabel,
	onAction,
}: {
	title: HomeFeedSection;
	actionLabel?: string;
	onAction?: () => void;
}) {
	return (
		<View className="flex-row items-center justify-between px-3 pb-1 pt-5">
			<Text className="font-sans-medium text-[13px] text-muted-foreground">
				{title}
			</Text>
			{actionLabel !== undefined && onAction !== undefined ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={actionLabel}
					hitSlop={8}
					onPress={onAction}
					className="min-h-11 items-center justify-center px-2"
				>
					<Text className="font-sans-medium text-[13px] text-accent">
						{actionLabel}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}
