export type SettingsConnectEntry = {
	readonly id: "nearby" | "scan" | "manual";
	readonly title: string;
	readonly href: "/connect/nearby" | "/connect/scan" | "/connect/manual";
};

/**
 * Connection rows shown in Settings. Nearby is iOS-native; Android and any
 * build without the local-connectivity module keep QR + manual.
 */
export const settingsConnectEntries = (
	localConnectivityAvailable: boolean,
): readonly SettingsConnectEntry[] => {
	const entries: SettingsConnectEntry[] = [];
	if (localConnectivityAvailable) {
		entries.push({
			id: "nearby",
			title: "Connect to a nearby Mac",
			href: "/connect/nearby",
		});
	}
	entries.push(
		{
			id: "scan",
			title: "Scan QR code",
			href: "/connect/scan",
		},
		{
			id: "manual",
			title: "Add manually",
			href: "/connect/manual",
		},
	);
	return entries;
};

export const nearbyUnavailableLinks = (): readonly {
	readonly id: "scan" | "manual";
	readonly title: string;
	readonly href: "/connect/scan" | "/connect/manual";
}[] => [
	{ id: "scan", title: "Scan QR", href: "/connect/scan" },
	{ id: "manual", title: "Add manually", href: "/connect/manual" },
];
