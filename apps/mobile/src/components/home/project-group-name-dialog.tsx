import { useEffect, useState } from "react";
import {
	KeyboardAvoidingView,
	Modal,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";

import { Button } from "~/components/ui/button";
import { colors } from "~/theme";

export function ProjectGroupNameDialog({
	visible,
	title,
	initialName,
	confirmLabel,
	onCancel,
	onSubmit,
}: {
	visible: boolean;
	title: string;
	initialName: string;
	confirmLabel: string;
	onCancel: () => void;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState(initialName);
	useEffect(() => {
		if (visible) setName(initialName);
	}, [initialName, visible]);
	const trimmed = name.trim();

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onCancel}
			statusBarTranslucent
		>
			<KeyboardAvoidingView behavior="padding" className="flex-1">
				<View className="flex-1 items-center justify-center px-6">
					<Pressable
						accessibilityLabel="Dismiss"
						onPress={onCancel}
						style={{
							position: "absolute",
							top: 0,
							right: 0,
							bottom: 0,
							left: 0,
							backgroundColor: "rgba(0,0,0,0.4)",
						}}
					/>
					<View className="w-full max-w-[420px] gap-3 rounded-2xl bg-background p-4">
						<Text className="font-sans-bold text-[18px] text-foreground">
							{title}
						</Text>
						<TextInput
							accessibilityLabel="Group name"
							autoFocus={visible}
							selectTextOnFocus
							value={name}
							onChangeText={setName}
							placeholder="Group name"
							placeholderTextColor={colors.tertiaryFg}
							className="min-h-11 rounded-xl border border-border px-3 font-sans text-[16px] text-foreground"
							returnKeyType="done"
							onSubmitEditing={() => {
								if (trimmed.length > 0) onSubmit(trimmed);
							}}
						/>
						<View className="flex-row justify-end gap-2">
							<Button variant="ghost" onPress={onCancel}>
								Cancel
							</Button>
							<Button
								disabled={trimmed.length === 0}
								onPress={() => onSubmit(trimmed)}
							>
								{confirmLabel}
							</Button>
						</View>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
