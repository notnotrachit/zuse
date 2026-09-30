const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/**
 * Local pairing and nearby proxies speak cleartext HTTP/WebSocket to a LAN
 * address or 127.0.0.1. Android blocks that unless the application allows it.
 * This matches the iOS local-networking exception.
 */
function withAndroidLocalNetwork(config) {
	return withAndroidManifest(config, (config) => {
		const application = AndroidConfig.Manifest.getMainApplication(
			config.modResults,
		);
		if (application) {
			application.$["android:usesCleartextTraffic"] = "true";
		}
		return config;
	});
}

module.exports = withAndroidLocalNetwork;
