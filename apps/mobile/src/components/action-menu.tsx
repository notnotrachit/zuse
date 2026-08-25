import { Modal, Pressable, Text } from "react-native";

import { colors } from "~/theme";

export type ActionMenuItem = {
	readonly key: string;
	readonly label: string;
	readonly destructive?: boolean;
	readonly onPress: () => void;
};

export function ActionMenu({
	visible,
	title,
	items,
	onClose,
}: {
	visible: boolean;
	title: string;
	items: readonly ActionMenuItem[];
	onClose: () => void;
}) {
	if (!visible) return null;
	return (
		<Modal
			transparent
			animationType="fade"
			visible={visible}
			onRequestClose={onClose}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Dismiss menu"
				onPress={onClose}
				style={{
					flex: 1,
					backgroundColor: "rgba(0,0,0,0.45)",
					justifyContent: "flex-end",
				}}
			>
				<Pressable
					onPress={(event) => event.stopPropagation()}
					style={{
						backgroundColor: colors.bg,
						borderTopLeftRadius: 20,
						borderTopRightRadius: 20,
						paddingBottom: 28,
						paddingTop: 12,
					}}
				>
					<Text
						style={{
							color: colors.secondaryFg,
							fontSize: 13,
							paddingHorizontal: 20,
							paddingVertical: 8,
						}}
					>
						{title}
					</Text>
					{items.map((item) => (
						<Pressable
							key={item.key}
							accessibilityRole="button"
							accessibilityLabel={item.label}
							onPress={() => {
								onClose();
								item.onPress();
							}}
							style={{ paddingHorizontal: 20, paddingVertical: 14 }}
						>
							<Text
								style={{
									color: item.destructive ? "#FF453A" : colors.fg,
									fontSize: 17,
								}}
							>
								{item.label}
							</Text>
						</Pressable>
					))}
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Cancel"
						onPress={onClose}
						style={{ paddingHorizontal: 20, paddingVertical: 14 }}
					>
						<Text style={{ color: colors.secondaryFg, fontSize: 17 }}>
							Cancel
						</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
