import {
	Camera,
	FileText,
	Image as ImageIcon,
	ListChecks,
	Plus,
	Target,
} from "lucide-react-native";
import { View } from "react-native";

import { AnchoredMenu } from "~/components/ui/anchored-menu";
import { colors } from "~/theme";

/** Non-iOS composer action menu. Same actions as the SwiftUI menu. */
export function ComposerPlusMenu({
	goalMode,
	goalSupported,
	planMode,
	onCaptureImage,
	onPickImages,
	onPickFiles,
	onToggleGoal,
	onTogglePlan,
}: {
	goalMode: boolean;
	goalSupported: boolean;
	planMode: boolean;
	onCaptureImage: () => void;
	onPickImages: () => void;
	onPickFiles: () => void;
	onToggleGoal: (next: boolean) => void;
	onTogglePlan: (next: boolean) => void;
}) {
	return (
		<AnchoredMenu
			accessibilityLabel="Add attachment"
			trigger={
				<View className="h-10 w-10 items-center justify-center">
					<Plus size={21} color={colors.fg} />
				</View>
			}
			items={[
				{
					key: "camera",
					label: "Take photo",
					icon: <Camera size={18} color={colors.fg} />,
					onPress: onCaptureImage,
				},
				{
					key: "photos",
					label: "Choose photos",
					icon: <ImageIcon size={18} color={colors.fg} />,
					onPress: onPickImages,
				},
				{
					key: "files",
					label: "Choose files",
					icon: <FileText size={18} color={colors.fg} />,
					onPress: onPickFiles,
				},
				...(goalSupported
					? [
							{
								key: "goal",
								label: "Add goal",
								selected: goalMode,
								icon: <Target size={18} color={colors.fg} />,
								onPress: () => onToggleGoal(!goalMode),
							},
						]
					: []),
				{
					key: "plan",
					label: "Plan mode",
					selected: planMode,
					icon: <ListChecks size={18} color={colors.fg} />,
					onPress: () => onTogglePlan(!planMode),
				},
			]}
		/>
	);
}
