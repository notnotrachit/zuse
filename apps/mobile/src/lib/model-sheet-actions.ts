import type { ProviderId, RuntimeMode } from "@zuse/contracts";

import type { ActionMenuItem } from "~/components/action-menu";
import type { ModelModeValue } from "~/lib/model-mode-value";
import {
	defaultModelOptions,
	modelOptionsForProvider,
	providerOptions,
	RUNTIME_OPTIONS,
} from "~/lib/model-options";

export type ModelSheetActionProps = {
	readonly value: ModelModeValue;
	readonly availableProviders?: readonly ProviderId[] | null;
	readonly canChangeProvider: boolean;
	readonly onChange: (value: ModelModeValue) => void;
};

export const modelSheetProviderItems = (
	props: Pick<
		ModelSheetActionProps,
		"value" | "availableProviders" | "canChangeProvider" | "onChange"
	>,
): ActionMenuItem[] => {
	if (!props.canChangeProvider) return [];
	const providers = providerOptions().filter((provider) => {
		if (props.availableProviders == null) return true;
		return (
			provider.value === props.value.providerId ||
			props.availableProviders.includes(provider.value)
		);
	});
	return providers.map((provider) => ({
		key: provider.value,
		label:
			provider.value === props.value.providerId
				? `✓ ${provider.label}`
				: provider.label,
		onPress: () => {
			const nextModel =
				modelOptionsForProvider(provider.value)[0]?.value ?? props.value.model;
			props.onChange({
				...props.value,
				providerId: provider.value,
				model: nextModel,
				modelOptions: defaultModelOptions(provider.value, nextModel),
			});
		},
	}));
};

export const modelSheetModelItems = (
	props: Pick<ModelSheetActionProps, "value" | "onChange">,
): ActionMenuItem[] =>
	modelOptionsForProvider(props.value.providerId).map((model) => ({
		key: model.value,
		label: model.value === props.value.model ? `✓ ${model.label}` : model.label,
		onPress: () =>
			props.onChange({
				...props.value,
				model: model.value,
				modelOptions: defaultModelOptions(props.value.providerId, model.value),
			}),
	}));

export const modelSheetRuntimeItems = (
	props: Pick<ModelSheetActionProps, "value" | "onChange">,
): ActionMenuItem[] =>
	RUNTIME_OPTIONS.map((option) => ({
		key: option.value,
		label:
			option.value === props.value.runtimeMode
				? `✓ ${option.label}`
				: option.label,
		onPress: () =>
			props.onChange({
				...props.value,
				runtimeMode: option.value as RuntimeMode,
			}),
	}));
