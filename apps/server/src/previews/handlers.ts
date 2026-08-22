import {
	DEFAULT_LOCAL_DESKTOP_PORT,
	MemoizeRpcs,
	PreviewServer,
	PreviewsError,
} from "@zuse/contracts";
import { listListeningServers } from "@zuse/utils/port-inspector";
import { Effect, Layer } from "effect";

/**
 * Lists dev servers listening on this environment. Because the same server
 * binary runs on the laptop, an SSH box, and a cloud sandbox, this one
 * handler gives every environment kind port discovery over its existing RPC
 * transport.
 */
const PreviewsListServers = MemoizeRpcs.toLayerHandler(
	"previews.listServers",
	() =>
		Effect.tryPromise({
			try: () => listListeningServers(process.platform),
			catch: (cause) =>
				new PreviewsError({
					reason: cause instanceof Error ? cause.message : String(cause),
				}),
		}).pipe(
			Effect.map((servers) => ({
				servers: servers
					.filter((server) => server.port !== DEFAULT_LOCAL_DESKTOP_PORT)
					.slice(0, 50)
					.map(
						(server) =>
							new PreviewServer({
								name: server.name,
								port: server.port,
								loopbackOnly: server.loopbackOnly,
							}),
					),
			})),
		),
);

export const PreviewsHandlersLayer = Layer.mergeAll(PreviewsListServers);
