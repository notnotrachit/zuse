import type { RuntimeMode } from "@zuse/contracts";
import { Lock, LockOpen, ShieldCheck } from "lucide-react-native";
import { View } from "react-native";

import { AnchoredMenu } from "~/components/ui/anchored-menu";
import { RUNTIME_OPTIONS, runtimeOptionFor } from "~/lib/model-options";
import { colors } from "~/theme";

const runtimeIcon = (mode: RuntimeMode) => {
	if (mode === "full-access") return LockOpen;
	if (mode === "approval-required") return Lock;
	return ShieldCheck;
};

/** Non-iOS composer "hand" button: the same approval modes as the native menu. */
export function ComposerApprovalMenu({
	runtimeMode,
	onChange,
}: {
	runtimeMode: RuntimeMode;
	onChange: (mode: RuntimeMode) => void;
}) {
	const selected = runtimeOptionFor(runtimeMode);
	const TriggerIcon = runtimeIcon(runtimeMode);

	return (
		<AnchoredMenu
			accessibilityLabel={`${selected.label} permissions`}
			trigger={
				<View className="h-10 w-10 items-center justify-center">
					<TriggerIcon size={19} color={selected.tint} />
				</View>
			}
			items={RUNTIME_OPTIONS.map((option) => {
				const Icon = runtimeIcon(option.value);
				return {
					key: option.value,
					label: option.label,
					selected: runtimeMode === option.value,
					destructive: option.value === "full-access",
					icon: (
						<Icon
							size={18}
							color={
								option.value === "full-access" ? colors.danger : option.tint
							}
						/>
					),
					onPress: () => onChange(option.value),
				};
			})}
		/>
	);
}
