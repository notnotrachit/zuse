import { HugeiconsIcon } from "@hugeicons/react";
import { EnvironmentId } from "@zuse/contracts";
import { CloudIcon, RefreshIcon } from "@zuse/icons/solid-rounded";
import { useAuth } from "../hooks/use-auth.ts";
import { deriveCloudChatActivity } from "../lib/cloud-chat-activity.ts";
import {
	type CloudConnectionPresentation,
	cloudConnectionPresentation,
} from "../lib/cloud-connection-presentation.ts";
import {
	cloudSummaryForChat,
	useCloudChatCatalogStore,
} from "../lib/cloud-workspace-catalog.ts";
import { cloudTranscriptActivation } from "../lib/cloud-workspace-lifecycle.ts";
import { useEnvironmentShellResource } from "../lib/environment-shell-client-bus.ts";
import { retryRendererEnvironmentConnection } from "../lib/session-timeline-client-bus.ts";
import { useOptionalRendererSessionTimeline } from "../lib/session-timeline-hooks.ts";
import { useChatsStore } from "../store/chats.ts";
import { ShimmerText } from "./ui/shimmer-text.tsx";
import { Spinner } from "./ui/spinner.tsx";

const copy: Record<
	Exclude<CloudConnectionPresentation, "hidden">,
	{ readonly title: string; readonly detail: string }
> = {
	paused: {
		title: "Cloud workspace paused",
		detail: "Sending a message or opening a live tool will resume it.",
	},
	resuming: {
		title: "Resuming cloud workspace",
		detail: "The sandbox compute is waking up.",
	},
	updating: {
		title: "Updating cloud runtime",
		detail: "Zuse will reconnect after the compatible runtime starts.",
	},
	failed: {
		title: "Connection failed",
		detail: "Your cached chat is still available.",
	},
};

export function CloudConnectionNotice() {
	const { signIn, signingIn, isSignedIn, isLoading } = useAuth();
	const selectedChatId = useChatsStore((state) => state.selectedChatId);
	const registered =
		selectedChatId === null ? null : cloudSummaryForChat(selectedChatId);
	const summary = useCloudChatCatalogStore((state) =>
		selectedChatId === null
			? null
			: (state.summaries.find((item) => item.chatId === selectedChatId) ??
				registered),
	);
	const shell = useEnvironmentShellResource(
		summary === null ? null : EnvironmentId.make(summary.workspaceId),
		"cache-only",
	);
	const timeline = useOptionalRendererSessionTimeline(
		summary?.initialSessionId ?? null,
		summary === null ? "cache-only" : cloudTranscriptActivation(summary),
		summary === null ? null : EnvironmentId.make(summary.workspaceId),
	);
	const runtime = timeline.runtime;
	if (summary === null) return null;
	const activity = deriveCloudChatActivity({
		summary,
		connection: shell.connection,
		runtime,
	});
	const presentation = cloudConnectionPresentation(summary, activity);
	// A signed-out session can never reconnect a cloud workspace, so it shows
	// one steady sign-in banner immediately — never the reconnect states.
	const blockedAuth =
		(!isLoading && !isSignedIn) || shell.connection === "blocked-auth";
	if (presentation === "hidden" && !blockedAuth) return null;
	const retry = () =>
		retryRendererEnvironmentConnection(EnvironmentId.make(summary.workspaceId));
	const value = blockedAuth
		? {
				title: "Sign in required",
				detail:
					"Your session expired — sign in to reconnect this cloud workspace.",
			}
		: presentation === "hidden"
			? null
			: copy[presentation];
	if (value === null) return null;
	const busy =
		!blockedAuth &&
		(presentation === "resuming" || presentation === "updating");
	return (
		<div
			role="status"
			aria-live="polite"
			className="mb-1 flex min-h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/90 px-3 py-2 text-xs shadow-sm"
		>
			{busy ? (
				<Spinner className="size-4 shrink-0 text-muted-foreground motion-reduce:animate-none" />
			) : (
				<HugeiconsIcon
					icon={CloudIcon}
					className="size-4 shrink-0 text-muted-foreground"
				/>
			)}
			<div className="min-w-0 flex-1">
				{busy ? (
					<ShimmerText>{value.title}</ShimmerText>
				) : (
					<p className="font-medium text-foreground">{value.title}</p>
				)}
				<p className="truncate text-muted-foreground">{value.detail}</p>
			</div>
			{presentation === "failed" || blockedAuth ? (
				<button
					type="button"
					disabled={signingIn}
					className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => {
						if (blockedAuth) void signIn();
						else retry();
					}}
				>
					<HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
					{blockedAuth ? (signingIn ? "Signing in…" : "Sign in") : "Retry"}
				</button>
			) : null}
		</div>
	);
}
