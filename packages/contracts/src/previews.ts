import { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";

/**
 * A dev server listening on the environment that serves this RPC. Discovery
 * runs on whichever host the client is connected to (local desktop, SSH box,
 * or cloud sandbox), so the same contract powers every environment kind.
 */
export class PreviewServer extends Schema.Class<PreviewServer>("PreviewServer")(
	{
		name: Schema.String,
		port: Schema.Number,
		/**
		 * True when every listener on this port binds a loopback address. Such a
		 * server is reachable through a local tunnel but not via a per-port
		 * public host, which only routes to non-loopback binds.
		 */
		loopbackOnly: Schema.Boolean,
	},
) {}

export class PreviewsError extends Schema.TaggedErrorClass<PreviewsError>()(
	"PreviewsError",
	{
		reason: Schema.String,
	},
) {}

export const PreviewsListServersRpc = Rpc.make("previews.listServers", {
	payload: Schema.Void,
	success: Schema.Struct({ servers: Schema.Array(PreviewServer) }),
	error: PreviewsError,
});
