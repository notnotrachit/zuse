import { Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable } from "react-native";

import { colors } from "~/theme";
import { ActionMenu, type ActionMenuItem } from "./action-menu";

export type ComposerPlusMenuProps = {
	goalMode: boolean;
	goalSupported: boolean;
	planMode: boolean;
	onCaptureImage: () => void;
	onPickImages: () => void;
	onPickFiles: () => void;
	onToggleGoal: (next: boolean) => void;
	onTogglePlan: (next: boolean) => void;
};

export const composerPlusItems = (
	props: ComposerPlusMenuProps,
): ActionMenuItem[] => {
	const items: ActionMenuItem[] = [
		{ key: "camera", label: "Take photo", onPress: props.onCaptureImage },
		{ key: "photos", label: "Choose photos", onPress: props.onPickImages },
		{ key: "files", label: "Choose files", onPress: props.onPickFiles },
	];
	if (props.goalSupported) {
		items.push({
			key: "goal",
			label: props.goalMode ? "✓ Add goal" : "Add goal",
			onPress: () => props.onToggleGoal(!props.goalMode),
		});
	}
	items.push({
		key: "plan",
		label: props.planMode ? "✓ Plan mode" : "Plan mode",
		onPress: () => props.onTogglePlan(!props.planMode),
	});
	return items;
};

export function ComposerPlusMenu(props: ComposerPlusMenuProps) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Add attachment"
				className="h-11 w-11 items-center justify-center"
				onPress={() => setOpen(true)}
			>
				<Plus size={21} color={colors.fg} />
			</Pressable>
			<ActionMenu
				visible={open}
				title="Add to message"
				items={composerPlusItems(props)}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}
