import { AccountAccessOpError, MemoizeRpcs } from "@zuse/contracts";
import { Effect, Layer, Stream } from "effect";

import {
	AccountAccessService,
	type AccountAccessServiceShape,
} from "./service.ts";

const mapError = (error: { readonly code: string }): AccountAccessOpError =>
	new AccountAccessOpError({
		code: error.code as AccountAccessOpError["code"],
	});

const withService = <A>(
	run: (
		service: AccountAccessServiceShape,
	) => Effect.Effect<A, { readonly code: string }>,
) => Effect.flatMap(AccountAccessService, run).pipe(Effect.mapError(mapError));

const withStream = <A>(
	run: (
		service: AccountAccessServiceShape,
	) => Stream.Stream<A, { readonly code: string }>,
) =>
	Stream.unwrap(Effect.map(AccountAccessService, run)).pipe(
		Stream.mapError(mapError),
	);

const Status = MemoizeRpcs.toLayerHandler("accountAccess.status", () =>
	withService((service) => service.status()),
);

const StartLogin = MemoizeRpcs.toLayerHandler(
	"accountAccess.startLogin",
	({ providerId }) => withStream((service) => service.startLogin(providerId)),
);

const SetCredential = MemoizeRpcs.toLayerHandler(
	"accountAccess.setCredential",
	(input) => withService((service) => service.setCredential(input)),
);

const ConfigureCustom = MemoizeRpcs.toLayerHandler(
	"accountAccess.configureCustom",
	(input) => withService((service) => service.configureCustom(input)),
);

const Disconnect = MemoizeRpcs.toLayerHandler(
	"accountAccess.disconnect",
	({ providerId }) => withService((service) => service.disconnect(providerId)),
);

export const AccountAccessHandlersLayer = Layer.mergeAll(
	Status,
	StartLogin,
	SetCredential,
	ConfigureCustom,
	Disconnect,
);
