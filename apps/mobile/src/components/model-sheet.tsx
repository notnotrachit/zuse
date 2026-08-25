import type { ProviderId } from "@zuse/contracts";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { ModelModeValue } from "~/lib/model-mode-value";
import { runtimeOptionFor } from "~/lib/model-options";
import {
	modelSheetModelItems,
	modelSheetProviderItems,
	modelSheetRuntimeItems,
} from "~/lib/model-sheet-actions";
import { colors } from "~/theme";
import type { ActionMenuItem } from "./action-menu";

export {
	modelSheetModelItems,
	modelSheetProviderItems,
	modelSheetRuntimeItems,
} from "~/lib/model-sheet-actions";

export type ModelSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value: ModelModeValue;
	availableProviders?: readonly ProviderId[] | null;
	canChangeProvider: boolean;
	canChangeReasoning: boolean;
	onChange: (value: ModelModeValue) => void;
};

export function ModelSheet(props: ModelSheetProps) {
	if (!props.open) return null;
	const runtime = runtimeOptionFor(props.value.runtimeMode);
	const providers = modelSheetProviderItems(props);
	const models = modelSheetModelItems(props);
	const runtimes = modelSheetRuntimeItems(props);
	return (
		<Modal
			transparent
			animationType="slide"
			visible={props.open}
			onRequestClose={() => props.onOpenChange(false)}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Dismiss model settings"
				onPress={() => props.onOpenChange(false)}
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
						maxHeight: "80%",
						paddingBottom: 28,
						paddingTop: 12,
					}}
				>
					<Text
						style={{
							color: colors.fg,
							fontSize: 17,
							fontWeight: "600",
							paddingHorizontal: 20,
							paddingVertical: 8,
						}}
					>
						Model settings
					</Text>
					<ScrollView>
						{providers.length > 1 ? (
							<SheetSection title="Provider" items={providers} />
						) : null}
						<SheetSection title="Model" items={models} />
						<SheetSection
							title={`Approval · ${runtime.label}`}
							items={runtimes}
						/>
					</ScrollView>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Done"
						onPress={() => props.onOpenChange(false)}
						style={{ paddingHorizontal: 20, paddingVertical: 14 }}
					>
						<Text style={{ color: colors.secondaryFg, fontSize: 17 }}>
							Done
						</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

function SheetSection({
	title,
	items,
}: {
	title: string;
	items: readonly ActionMenuItem[];
}) {
	return (
		<View>
			<Text
				style={{
					color: colors.secondaryFg,
					fontSize: 13,
					paddingHorizontal: 20,
					paddingTop: 12,
				}}
			>
				{title}
			</Text>
			{items.map((item) => (
				<Pressable
					key={item.key}
					accessibilityRole="button"
					accessibilityLabel={item.label}
					onPress={item.onPress}
					style={{ paddingHorizontal: 20, paddingVertical: 14 }}
				>
					<Text style={{ color: colors.fg, fontSize: 17 }}>{item.label}</Text>
				</Pressable>
			))}
		</View>
	);
}
