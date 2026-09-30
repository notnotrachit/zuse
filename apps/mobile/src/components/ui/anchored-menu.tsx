import { Check } from "lucide-react-native";
import { useRef, useState } from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

import { selectionTap } from "~/lib/haptics";
import { colors } from "~/theme";

export type AnchoredMenuItem = {
	key: string;
	label: string;
	icon?: React.ReactNode;
	selected?: boolean;
	destructive?: boolean;
	disabled?: boolean;
	onPress: () => void;
};

type Anchor = {
	x: number;
	y: number;
	width: number;
	height: number;
};

const MENU_WIDTH = 280;
const ROW_HEIGHT = 48;

/**
 * Android/non-iOS stand-in for the SwiftUI menus. The menu opens next to the
 * control that summoned it, including while the keyboard is up, instead of
 * dropping the action.
 */
export function AnchoredMenu({
	accessibilityLabel,
	trigger,
	items,
}: {
	accessibilityLabel: string;
	trigger: React.ReactNode;
	items: readonly AnchoredMenuItem[];
}) {
	const triggerRef = useRef<View>(null);
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const { width: screenWidth, height: screenHeight } = useWindowDimensions();
	const menuHeight = Math.min(360, Math.max(items.length, 1) * ROW_HEIGHT + 8);

	const open = () => {
		selectionTap();
		triggerRef.current?.measureInWindow((x, y, width, height) => {
			setAnchor({ x, y, width, height });
		});
	};

	let left = 8;
	let top = 8;
	if (anchor !== null) {
		const spaceBelow = screenHeight - (anchor.y + anchor.height);
		const spaceAbove = anchor.y;
		const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
		top = openUp
			? Math.max(8, anchor.y - menuHeight - 8)
			: Math.min(screenHeight - menuHeight - 8, anchor.y + anchor.height + 8);
		left = anchor.x;
		if (left + MENU_WIDTH > screenWidth - 8) {
			left = anchor.x + anchor.width - MENU_WIDTH;
		}
		if (left < 8) left = 8;
	}

	return (
		<>
			<View ref={triggerRef} collapsable={false}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={accessibilityLabel}
					hitSlop={8}
					onPress={open}
				>
					{trigger}
				</Pressable>
			</View>
			<Modal
				visible={anchor !== null}
				transparent
				animationType="fade"
				onRequestClose={() => setAnchor(null)}
				statusBarTranslucent
			>
				<View style={{ flex: 1 }}>
					<Pressable
						accessibilityLabel="Dismiss menu"
						onPress={() => setAnchor(null)}
						style={{
							position: "absolute",
							top: 0,
							right: 0,
							bottom: 0,
							left: 0,
							backgroundColor: "rgba(0,0,0,0.2)",
						}}
					/>
					<View
						style={{
							position: "absolute",
							top,
							left,
							width: MENU_WIDTH,
							maxHeight: 360,
							borderRadius: 16,
							borderWidth: 1,
							borderColor: colors.border,
							backgroundColor: colors.card,
							overflow: "hidden",
							elevation: 8,
						}}
					>
						<ScrollView bounces={false}>
							{items.map((item) => (
								<Pressable
									key={item.key}
									accessibilityRole="button"
									accessibilityLabel={item.label}
									accessibilityState={{
										selected: item.selected === true,
										disabled: item.disabled === true,
									}}
									disabled={item.disabled === true}
									onPress={() => {
										setAnchor(null);
										item.onPress();
									}}
									style={{
										minHeight: ROW_HEIGHT,
										paddingHorizontal: 14,
										flexDirection: "row",
										alignItems: "center",
										gap: 12,
										opacity: item.disabled ? 0.45 : 1,
									}}
								>
									{item.icon}
									<Text
										numberOfLines={2}
										style={{
											flex: 1,
											fontSize: 16,
											color: item.destructive ? colors.danger : colors.fg,
										}}
									>
										{item.label}
									</Text>
									{item.selected ? (
										<Check size={16} color={colors.accent} />
									) : (
										<View style={{ width: 16 }} />
									)}
								</Pressable>
							))}
						</ScrollView>
					</View>
				</View>
			</Modal>
		</>
	);
}
