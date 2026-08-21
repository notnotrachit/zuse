import { getTunnelsBridge } from "./bridge.ts";
import { prepareCloudWorkspaceSsh } from "./cloud-ssh-client-bus.ts";
import {
	getLocalEnvironmentId,
	isCloudWorkspaceEnvironment,
} from "./rpc-client.ts";

/**
 * Ensure a dev server port on the given environment is reachable locally and
 * return the local port to open. Local environments need no forward; cloud
 * and SSH environments get an idempotent tunnel from the desktop main
 * process. Cloud forwards refresh the workspace SSH ticket first, so an
 * expired ticket never surfaces as a dead tunnel.
 */
export const ensurePortForward = async (
	environmentId: string,
	remotePort: number,
): Promise<number> => {
	if (environmentId === getLocalEnvironmentId()) return remotePort;
	const tunnels = getTunnelsBridge();
	if (tunnels === undefined) {
		throw new Error("Previewing remote servers requires the Zuse desktop app.");
	}
	if (isCloudWorkspaceEnvironment(environmentId)) {
		await prepareCloudWorkspaceSsh(environmentId);
		const forward = await tunnels.open({
			environmentId,
			remotePort,
			cloudWorkspaceId: environmentId,
		});
		return forward.localPort;
	}
	const forward = await tunnels.open({ environmentId, remotePort });
	return forward.localPort;
};
