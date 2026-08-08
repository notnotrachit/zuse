import { type LucideIcon } from "lucide-react-native";
import type { ColorValue } from "react-native";

type HugeIconProps = {
	icon: LucideIcon;
	size?: number;
	color: ColorValue;
};

export const HugeIcon = ({ icon: Icon, size = 16, color }: HugeIconProps) => <Icon size={size} color={color} strokeWidth={1} />;
