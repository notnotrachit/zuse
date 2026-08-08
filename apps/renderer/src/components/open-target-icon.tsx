import { Code, FolderOpen, MousePointer2, Terminal } from "lucide-react";

import type { OpenTarget } from "../lib/bridge.ts";

const fallbackIconForTarget = (targetId: string) => {
	switch (targetId) {
		case "finder":
			return FolderOpen;
		case "vscode":
			return Code;
		case "cursor":
			return MousePointer2;
		case "ghostty":
		case "terminal":
			return Terminal;
		default:
			return Code;
	}
};

export function OpenTargetIcon({ target }: { target: OpenTarget }) {
	if (target.iconDataUrl === null || target.iconDataUrl === undefined) {
		const Icon = fallbackIconForTarget(target.id);
		return <Icon className="size-5 shrink-0 text-muted-foreground" />;
	}
	return (
		<img
			alt=""
			src={target.iconDataUrl}
			className="size-5 shrink-0 rounded-[4px]"
		/>
	);
}
