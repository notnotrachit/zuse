import { ChevronsUpDown } from "lucide-react-native";
import { Text, View } from "react-native";

import { AnchoredMenu } from "~/components/ui/anchored-menu";
import { colors } from "~/theme";

export type SelectorOption = {
	key: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
};

/**
 * Non-iOS selector. Opens the same choices as the SwiftUI menu, anchored to
 * the row, including while the keyboard is up.
 */
export function SelectorRow({
	label,
	options,
	disabled = false,
	emptyLabel = "None",
	compact = false,
}: {
	symbol: string;
	label: string;
	options: readonly SelectorOption[];
	disabled?: boolean;
	emptyLabel?: string;
	compact?: boolean;
}) {
	const items =
		disabled || options.length === 0
			? [
					{
						key: "empty",
						label: emptyLabel,
						disabled: true,
						onPress: () => {},
					},
				]
			: options.map((option) => ({
					key: option.key,
					label: option.label,
					selected: option.selected,
					onPress: option.onSelect,
				}));

	return (
		<AnchoredMenu
			accessibilityLabel={label}
			trigger={
				<View
					className={`${compact ? "h-7" : "h-11"} flex-row items-center gap-2`}
				>
					<Text
						className="font-sans-medium text-[15px] text-foreground"
						numberOfLines={1}
					>
						{label}
					</Text>
					<ChevronsUpDown size={11} color={colors.tertiaryFg} />
				</View>
			}
			items={items}
		/>
	);
}
