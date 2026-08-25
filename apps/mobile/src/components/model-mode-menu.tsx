import type { ProviderId } from "@zuse/contracts";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import type { ModelModeValue } from "~/lib/model-mode-value";
import { modelOptionsForProvider } from "~/lib/model-options";
import {
	modelSheetModelItems,
	modelSheetProviderItems,
	modelSheetRuntimeItems,
} from "~/lib/model-sheet-actions";
import type { ActionMenuItem } from "./action-menu";
import { ActionMenu } from "./action-menu";

export type { ModelModeValue } from "~/lib/model-mode-value";

type ModelModeProps = {
	value: ModelModeValue;
	editable: boolean;
	onChange: (value: ModelModeValue) => void;
};

const FallbackPill = ({
	label,
	onPress,
	accessibilityLabel,
}: {
	label: string;
	onPress?: () => void;
	accessibilityLabel?: string;
}) => (
	<Pressable
		accessibilityRole="button"
		accessibilityLabel={accessibilityLabel ?? label}
		disabled={onPress === undefined}
		onPress={onPress}
		className="rounded-full border border-border bg-card-elevated px-3 py-2 active:opacity-75"
		style={{ borderCurve: "continuous" }}
	>
		<Text
			className="font-sans-medium text-[14px] text-foreground"
			numberOfLines={1}
		>
			{label}
		</Text>
	</Pressable>
);

export function ModelModePill({ value, editable, onChange }: ModelModeProps) {
	const [open, setOpen] = useState(false);
	const modelLabel =
		modelOptionsForProvider(value.providerId).find(
			(model) => model.value === value.model,
		)?.label ?? value.model;
	return (
		<>
			<FallbackPill
				label={modelLabel}
				onPress={editable ? () => setOpen(true) : undefined}
				accessibilityLabel="Model"
			/>
			<ActionMenu
				visible={open}
				title="Model"
				items={modelSheetModelItems({ value, onChange })}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}

export function ComposerModelMenu({
	value,
	editable,
	onChange,
	availableProviders,
	canChangeProvider = true,
}: {
	value: ModelModeValue;
	editable: boolean;
	onChange: (value: ModelModeValue) => void;
	availableProviders?: readonly ProviderId[] | null;
	canChangeProvider?: boolean;
	canChangeReasoning?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const modelLabel =
		modelOptionsForProvider(value.providerId).find(
			(model) => model.value === value.model,
		)?.label ?? value.model;
	const items = [
		...modelSheetProviderItems({
			value,
			availableProviders,
			canChangeProvider,
			onChange,
		}),
		...modelSheetModelItems({ value, onChange }),
		...modelSheetRuntimeItems({ value, onChange }),
	];
	return (
		<>
			<FallbackPill
				label={modelLabel}
				onPress={editable ? () => setOpen(true) : undefined}
				accessibilityLabel="Model settings"
			/>
			<ActionMenu
				visible={open}
				title="Model settings"
				items={items}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}

export const ComposerSettingsMenu = ({
	value,
	editable,
	onChange,
}: ModelModeProps) => {
	const [open, setOpen] = useState(false);
	return (
		<>
			<FallbackPill
				label={value.permissionMode}
				onPress={editable ? () => setOpen(true) : undefined}
				accessibilityLabel="Permissions"
			/>
			<ActionMenu
				visible={open}
				title="Permissions"
				items={modelSheetRuntimeItems({ value, onChange })}
				onClose={() => setOpen(false)}
			/>
		</>
	);
};

export const ComposerModeMenu = ComposerSettingsMenu;
export const ComposerApprovalMenu = ComposerSettingsMenu;

export const ModePill = ComposerSettingsMenu;

export const RuntimePill = ({ value, editable, onChange }: ModelModeProps) => {
	const [open, setOpen] = useState(false);
	return (
		<>
			<FallbackPill
				label={value.runtimeMode}
				onPress={editable ? () => setOpen(true) : undefined}
				accessibilityLabel="Runtime mode"
			/>
			<ActionMenu
				visible={open}
				title="Runtime"
				items={modelSheetRuntimeItems({ value, onChange })}
				onClose={() => setOpen(false)}
			/>
		</>
	);
};

export const StaticModelTitle = ({ value }: ModelModeProps) => {
	const modelLabel =
		modelOptionsForProvider(value.providerId).find(
			(model) => model.value === value.model,
		)?.label ?? value.model;
	return <FallbackPill label={modelLabel} />;
};

export const HeaderModePill = ComposerSettingsMenu;

export type ProjectOptionGroup = {
	connectionKey: string;
	connectionLabel: string;
	projects: readonly { id: string; name: string; path: string }[];
};

export const projectPillItems = (
	options: readonly ProjectOptionGroup[],
	onSelect: (connectionKey: string, projectId: string) => void,
): ActionMenuItem[] =>
	options.flatMap((group) =>
		group.projects.map((project) => ({
			key: `${group.connectionKey}:${project.id}`,
			label: `${group.connectionLabel} · ${project.name}`,
			onPress: () => onSelect(group.connectionKey, project.id),
		})),
	);

export function ProjectPill({
	label,
	options,
	onSelect,
}: {
	label: string;
	options: readonly ProjectOptionGroup[];
	onSelect: (connectionKey: string, projectId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<FallbackPill
				label={label}
				onPress={() => setOpen(true)}
				accessibilityLabel={label}
			/>
			<ActionMenu
				visible={open}
				title={label}
				items={projectPillItems(options, onSelect)}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}

export function SourcePill({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<>
			<FallbackPill label={label} />
			{children}
		</>
	);
}

export function ProjectMenuRow({
	label,
	subtitle,
	options,
	onSelect,
}: {
	label: string;
	subtitle: string;
	options: readonly ProjectOptionGroup[];
	onSelect: (connectionKey: string, projectId: string) => void;
}) {
	return (
		<ProjectPill
			label={`${label} · ${subtitle}`}
			options={options}
			onSelect={onSelect}
		/>
	);
}

export function SourceMenuRow({
	label,
	subtitle,
	children,
}: {
	label: string;
	subtitle: string;
	children: React.ReactNode;
}) {
	return (
		<>
			<FallbackPill label={`${label} · ${subtitle}`} />
			{children}
		</>
	);
}

export const NativeButton = (_props: {
	label: string;
	systemImage?: string;
	onPress?: () => void;
}) => null;
export const Menu = (_props: { label: string; children: React.ReactNode }) =>
	null;
export const Section = (_props: {
	title?: string;
	children: React.ReactNode;
}) => null;
export const Divider = () => null;
