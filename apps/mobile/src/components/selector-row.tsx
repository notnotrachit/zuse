import { ChevronsUpDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { colors } from "~/theme";
import { ActionMenu, type ActionMenuItem } from "./action-menu";

export type SelectorOption = {
	key: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
};

export const selectorMenuItems = (
	options: readonly SelectorOption[],
	emptyLabel = "None",
): ActionMenuItem[] => {
	if (options.length === 0) {
		return [{ key: "empty", label: emptyLabel, onPress: () => undefined }];
	}
	return options.map((option) => ({
		key: option.key,
		label: option.selected ? `✓ ${option.label}` : option.label,
		onPress: option.onSelect,
	}));
};

export function SelectorRow({
	label,
	options,
	disabled = false,
	emptyLabel = "None",
}: {
	symbol: string;
	label: string;
	options: readonly SelectorOption[];
	disabled?: boolean;
	emptyLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const items = selectorMenuItems(options, emptyLabel);
	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				disabled={disabled}
				onPress={() => {
					if (!disabled) setOpen(true);
				}}
				className="h-11 flex-row items-center gap-2"
			>
				<Text
					className="font-sans-medium text-[15px] text-foreground"
					numberOfLines={1}
				>
					{label}
				</Text>
				<ChevronsUpDown size={11} color={colors.tertiaryFg} />
			</Pressable>
			<ActionMenu
				visible={open}
				title={label}
				items={items}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}
