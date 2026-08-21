import type { CloudWorkspacePreviewUrl } from "@zuse/contracts";

import { runControlPlane } from "./control-plane-client.ts";

/**
 * Mint the per-port public preview host for a running cloud workspace. The
 * URL is public-by-URL — anyone holding it reaches the port — so UI that
 * shares it must say so. The remote server has to bind a non-loopback
 * address for the host to route (see `PreviewServer.loopbackOnly`).
 */
export const getCloudPreviewUrl = (
	workspaceId: string,
	port: number,
): Promise<CloudWorkspacePreviewUrl> =>
	runControlPlane((client) =>
		client["cloud.workspaces.previewUrl"]({ workspaceId, port }),
	);
