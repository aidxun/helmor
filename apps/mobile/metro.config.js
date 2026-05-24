const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const mobileModules = path.resolve(__dirname, "node_modules");

const swiftUiModules = new Set([
	"@expo/ui/swift-ui",
	"@expo/ui/swift-ui/modifiers",
]);

const isolatedReactModules = ["react", "react-dom"];

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (platform === "web" && swiftUiModules.has(moduleName)) {
		return {
			type: "empty",
		};
	}

	if (
		isolatedReactModules.some(
			(modulePrefix) =>
				moduleName === modulePrefix ||
				moduleName.startsWith(`${modulePrefix}/`),
		)
	) {
		return {
			type: "sourceFile",
			filePath: require.resolve(moduleName, { paths: [mobileModules] }),
		};
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
	cssEntryFile: "./src/global.css",
	debug: true,
});
