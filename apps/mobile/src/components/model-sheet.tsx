import type { ProviderId, RuntimeMode } from "@zuse/contracts";
import { Check } from "lucide-react-native";
import { type ReactNode, useEffect } from "react";
import {
	Keyboard,
	Modal,
	Pressable,
	ScrollView,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { selectionTap } from "~/lib/haptics";
import {
	defaultModelOptions,
	modelOptionsForProvider,
	providerOptions,
	RUNTIME_OPTIONS,
	reasoningValueForModel,
} from "~/lib/model-options";
import { activeModelCatalog } from "~/store/model-catalog";
import { colors } from "~/theme";
import type { ModelModeValue } from "./model-mode-menu";
import { ProviderLogo } from "./provider-logo";

/**
 * Non-iOS model sheet. Same provider, model, intelligence, and approval
 * choices as the SwiftUI form, presented in place from the composer.
 */
export function ModelSheet({
	open,
	onOpenChange,
	value,
	availableProviders,
	strictProviders = false,
	canChangeProvider,
	canChangeReasoning,
	onChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value: ModelModeValue;
	availableProviders?: readonly ProviderId[] | null;
	strictProviders?: boolean;
	canChangeProvider: boolean;
	canChangeReasoning: boolean;
	onChange: (value: ModelModeValue) => void;
}) {
	const insets = useSafeAreaInsets();
	const { height } = useWindowDimensions();
	const catalog = activeModelCatalog();
	const reasoning = reasoningValueForModel(
		catalog,
		value.providerId,
		value.model,
		value.modelOptions,
	);
	const providers = providerOptions(catalog).filter((provider) => {
		if (strictProviders && !availableProviders?.includes(provider.value)) {
			return false;
		}
		if (!canChangeProvider) return provider.value === value.providerId;
		if (availableProviders == null) return true;
		return (
			provider.value === value.providerId ||
			availableProviders.includes(provider.value)
		);
	});
	const models =
		strictProviders && !availableProviders?.includes(value.providerId)
			? []
			: modelOptionsForProvider(catalog, value.providerId);

	useEffect(() => {
		if (open) Keyboard.dismiss();
	}, [open]);

	const close = () => onOpenChange(false);
	const choose = (next: ModelModeValue) => {
		selectionTap();
		onChange(next);
	};

	return (
		<Modal
			visible={open}
			transparent
			animationType="fade"
			onRequestClose={close}
			statusBarTranslucent
		>
			<View className="flex-1 justify-end">
				<Pressable
					accessibilityLabel="Dismiss model settings"
					onPress={close}
					style={{
						position: "absolute",
						top: 0,
						right: 0,
						bottom: 0,
						left: 0,
						backgroundColor: "rgba(0,0,0,0.35)",
					}}
				/>
				<View
					style={{
						maxHeight: height * 0.86,
						borderTopLeftRadius: 20,
						borderTopRightRadius: 20,
						backgroundColor: colors.card,
						paddingBottom: Math.max(insets.bottom, 12),
					}}
				>
					<View className="h-11 flex-row items-center justify-between px-4">
						<Text className="font-sans-medium text-[17px] text-foreground">
							Model
						</Text>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Done"
							hitSlop={8}
							onPress={close}
							className="h-11 items-center justify-center px-1"
						>
							<Text className="font-sans-medium text-[16px] text-foreground">
								Done
							</Text>
						</Pressable>
					</View>
					<ScrollView bounces={false}>
						<SheetSection title="Model">
							{canChangeProvider && providers.length > 1 ? (
								<ChoiceGroup label="Provider">
									{providers.map((provider) => (
										<ChoiceRow
											key={provider.value}
											label={provider.label}
											selected={value.providerId === provider.value}
											icon={
												<ProviderLogo providerId={provider.value} size={18} />
											}
											onPress={() => {
												if (!canChangeProvider) return;
												const id = provider.value;
												const nextModel =
													modelOptionsForProvider(catalog, id)[0]?.value ??
													value.model;
												choose({
													...value,
													providerId: id,
													model: nextModel,
													modelOptions: defaultModelOptions(
														catalog,
														id,
														nextModel,
													),
												});
											}}
										/>
									))}
								</ChoiceGroup>
							) : null}
							<ChoiceGroup label="Model">
								{models.map((model) => (
									<ChoiceRow
										key={model.value}
										label={model.label}
										selected={value.model === model.value}
										icon={
											canChangeProvider ? undefined : (
												<ProviderLogo providerId={value.providerId} size={18} />
											)
										}
										onPress={() =>
											choose({
												...value,
												model: model.value,
												modelOptions: defaultModelOptions(
													catalog,
													value.providerId,
													model.value,
												),
											})
										}
									/>
								))}
							</ChoiceGroup>
							{canChangeReasoning && reasoning !== null ? (
								<ChoiceGroup label="Intelligence">
									{reasoning.descriptor.options.map((option) => (
										<ChoiceRow
											key={option.id}
											label={option.label}
											selected={reasoning.value === option.id}
											onPress={() =>
												choose({
													...value,
													modelOptions: {
														...(value.modelOptions ?? {}),
														[reasoning.descriptor.id]: option.id,
													},
												})
											}
										/>
									))}
								</ChoiceGroup>
							) : null}
						</SheetSection>
						<SheetSection title="Permissions">
							<ChoiceGroup label="Approval">
								{RUNTIME_OPTIONS.map((option) => (
									<ChoiceRow
										key={option.value}
										label={option.label}
										selected={value.runtimeMode === option.value}
										destructive={option.value === "full-access"}
										tint={
											value.runtimeMode === option.value
												? option.tint
												: undefined
										}
										onPress={() =>
											choose({
												...value,
												runtimeMode: option.value as RuntimeMode,
											})
										}
									/>
								))}
							</ChoiceGroup>
						</SheetSection>
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
}

function SheetSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<View className="pb-2">
			<Text className="px-4 pb-1 font-sans-medium text-[13px] uppercase tracking-wide text-muted-foreground">
				{title}
			</Text>
			{children}
		</View>
	);
}

function ChoiceGroup({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<View className="pb-2">
			<Text className="px-4 py-1 font-sans text-[12px] text-muted-foreground">
				{label}
			</Text>
			{children}
		</View>
	);
}

function ChoiceRow({
	label,
	selected,
	destructive = false,
	tint,
	icon,
	onPress,
}: {
	label: string;
	selected: boolean;
	destructive?: boolean;
	tint?: string;
	icon?: ReactNode;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected }}
			onPress={onPress}
			className="min-h-12 flex-row items-center gap-3 px-4 active:opacity-70"
		>
			{icon}
			<Text
				className={`flex-1 font-sans text-[16px] ${destructive ? "text-danger" : "text-foreground"}`}
				numberOfLines={1}
				style={tint === undefined ? undefined : { color: tint }}
			>
				{label}
			</Text>
			{selected ? (
				<Check size={16} color={colors.accent} />
			) : (
				<View style={{ width: 16 }} />
			)}
		</Pressable>
	);
}
