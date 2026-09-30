import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type NativeModule = {
	readonly presentQuickLook: (uri: string) => boolean;
	readonly beginBackgroundTask: () => Promise<number>;
	readonly endBackgroundTask: (id: number) => Promise<void>;
	readonly saveImageToPhotos: (uri: string) => Promise<boolean>;
	readonly shareFile?: (uri: string, title: string) => boolean;
};

const Native = requireOptionalNativeModule<NativeModule>("ZuseMobilePlatform");

export const presentQuickLook = (uri: string): boolean =>
	Native?.presentQuickLook(uri) === true;

/** Android share sheet for a local file. iOS keeps the system share API. */
export const shareLocalFile = (uri: string, title?: string): boolean => {
	if (Platform.OS !== "android" || Native?.shareFile === undefined)
		return false;
	return Native.shareFile(uri, title ?? "") === true;
};

export const beginBestEffortBackgroundTask = async (): Promise<number> =>
	(await Native?.beginBackgroundTask()) ?? 0;

export const endBestEffortBackgroundTask = async (
	id: number,
): Promise<void> => {
	if (id !== 0) await Native?.endBackgroundTask(id);
};

export const saveImageToPhotos = async (uri: string): Promise<boolean> =>
	(await Native?.saveImageToPhotos(uri)) === true;
