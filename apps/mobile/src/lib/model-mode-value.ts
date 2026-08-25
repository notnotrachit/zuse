import type { PermissionMode, ProviderId, RuntimeMode } from "@zuse/contracts";

export type ModelModeValue = {
	providerId: ProviderId;
	model: string;
	runtimeMode: RuntimeMode;
	permissionMode: PermissionMode;
	modelOptions?: Record<string, string>;
};
