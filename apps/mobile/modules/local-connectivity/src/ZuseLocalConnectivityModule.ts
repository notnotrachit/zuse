import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";

import {
	type NearbyService,
	normalizeNearbyServices,
} from "./normalize-nearby-services";

export type { NearbyService } from "./normalize-nearby-services";
export { nearbyMacDisplayName } from "./normalize-nearby-services";

type EventSubscription = { remove(): void };

export type LocalPathEvent = {
	readonly status: "satisfied" | "unsatisfied" | "requiresConnection";
	readonly usesWifi: boolean;
	readonly usesCellular: boolean;
	readonly generation: number;
};

export type LocalDiscoveryState = {
	readonly state: "starting" | "ready" | "waiting" | "failed" | "stopped";
	readonly reason?: string;
	readonly rawResultCount?: number;
	readonly serviceCount?: number;
};

export type LocalProxy = {
	readonly id: string;
	readonly host: "127.0.0.1";
	readonly port: number;
};

type LocalConnectivityNativeModule = {
	startDiscovery(): Promise<void>;
	stopDiscovery(): Promise<void>;
	openProxy(service: NearbyService): Promise<LocalProxy>;
	closeProxy(id: string): Promise<void>;
	proofForTrustRecord(
		recordId: string,
		challenge: string,
	): Promise<string | null>;
	hasTrustRecord(recordId: string): Promise<boolean>;
	addListener(
		event: "onServicesChanged",
		listener: (event: { readonly services: readonly NearbyService[] }) => void,
	): EventSubscription;
	addListener(
		event: "onPathChanged",
		listener: (event: LocalPathEvent) => void,
	): EventSubscription;
	addListener(
		event: "onDiscoveryStateChanged",
		listener: (event: LocalDiscoveryState) => void,
	): EventSubscription;
};

const Native = requireOptionalNativeModule<LocalConnectivityNativeModule>(
	"ZuseLocalConnectivity",
);

export const localConnectivityAvailable = Native !== null;

let askedForNearbyPermission = false;

/**
 * Android 13+ discovers Wi-Fi services with nearby-devices access. Older
 * releases still require location access for the same NSD browse. Ask once
 * per process so a denial does not reopen the dialog on every path change.
 */
const ensureAndroidNearbyPermission = async (): Promise<void> => {
	if (Platform.OS !== "android") return;
	const version =
		typeof Platform.Version === "number" ? Platform.Version : Number.NaN;
	const permission =
		version >= 33
			? PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
			: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
	if (permission === undefined) return;
	if (await PermissionsAndroid.check(permission)) return;
	if (askedForNearbyPermission) return;
	askedForNearbyPermission = true;
	await PermissionsAndroid.request(permission, {
		title: "Find nearby computers",
		message:
			"Zuse looks for a Mac on this Wi-Fi network so you can pair without scanning a QR code.",
		buttonPositive: "Allow",
		buttonNegative: "Not now",
	});
};

export const startLocalDiscovery = async (): Promise<void> => {
	if (Native === null) return;
	await ensureAndroidNearbyPermission();
	await Native.startDiscovery();
};

export const stopLocalDiscovery = async (): Promise<void> => {
	await Native?.stopDiscovery();
};

export const openLocalProxy = async (
	service: NearbyService,
): Promise<LocalProxy> => {
	if (Native === null) throw new Error("local_connectivity_unavailable");
	return Native.openProxy(service);
};

export const closeLocalProxy = async (id: string): Promise<void> => {
	await Native?.closeProxy(id);
};

let latestNearbyServices: readonly NearbyService[] = [];
const nearbyListeners = new Set<(services: readonly NearbyService[]) => void>();
Native?.addListener("onServicesChanged", (event) => {
	latestNearbyServices = normalizeNearbyServices(event.services);
	for (const listener of nearbyListeners) listener(latestNearbyServices);
});

let latestDiscoveryState: LocalDiscoveryState = { state: "stopped" };
const discoveryStateListeners = new Set<(state: LocalDiscoveryState) => void>();
Native?.addListener("onDiscoveryStateChanged", (event) => {
	latestDiscoveryState =
		event.serviceCount === undefined
			? event
			: { ...event, serviceCount: latestNearbyServices.length };
	for (const listener of discoveryStateListeners)
		listener(latestDiscoveryState);
});

export const onNearbyServicesChanged = (
	listener: (services: readonly NearbyService[]) => void,
): (() => void) => {
	nearbyListeners.add(listener);
	listener(latestNearbyServices);
	return () => nearbyListeners.delete(listener);
};

export const onLocalDiscoveryStateChanged = (
	listener: (state: LocalDiscoveryState) => void,
): (() => void) => {
	discoveryStateListeners.add(listener);
	listener(latestDiscoveryState);
	return () => discoveryStateListeners.delete(listener);
};

export const onLocalPathChanged = (
	listener: (event: LocalPathEvent) => void,
): (() => void) => {
	const subscription = Native?.addListener("onPathChanged", listener);
	return () => subscription?.remove();
};
