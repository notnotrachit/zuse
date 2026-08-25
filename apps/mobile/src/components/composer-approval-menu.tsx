import type { RuntimeMode } from "@zuse/contracts";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { RUNTIME_OPTIONS, runtimeOptionFor } from "~/lib/model-options";
import { ActionMenu, type ActionMenuItem } from "./action-menu";

export const composerApprovalItems = (
	runtimeMode: RuntimeMode,
	onChange: (mode: RuntimeMode) => void,
): ActionMenuItem[] =>
	RUNTIME_OPTIONS.map((option) => ({
		key: option.value,
		label: option.value === runtimeMode ? `✓ ${option.label}` : option.label,
		onPress: () => onChange(option.value),
	}));

export function ComposerApprovalMenu({
	runtimeMode,
	onChange,
}: {
	runtimeMode: RuntimeMode;
	onChange: (mode: RuntimeMode) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = runtimeOptionFor(runtimeMode);
	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${selected.label} permissions`}
				className="h-11 w-11 items-center justify-center"
				onPress={() => setOpen(true)}
			>
				<Text style={{ color: selected.tint, fontSize: 13 }}>
					{selected.label}
				</Text>
			</Pressable>
			<ActionMenu
				visible={open}
				title="Permissions"
				items={composerApprovalItems(runtimeMode, onChange)}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}
