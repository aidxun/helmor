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

const isolatedMobileModules = ["react", "react-dom", "lucide-react"];
const isolatedRadixReactPrefix = "@radix-ui/react-";

function isIsolatedMobileModule(moduleName) {
	return isolatedMobileModules.some(
		(modulePrefix) =>
			moduleName === modulePrefix || moduleName.startsWith(`${modulePrefix}/`),
	);
}

function resolveSourceFile(moduleName, paths) {
	return {
		type: "sourceFile",
		filePath: require.resolve(moduleName, { paths }),
	};
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (platform === "web" && swiftUiModules.has(moduleName)) {
		return {
			type: "empty",
		};
	}

	if (moduleName.startsWith(isolatedRadixReactPrefix)) {
		const originDir = context.originModulePath
			? path.dirname(context.originModulePath)
			: mobileModules;
		return resolveSourceFile(moduleName, [originDir, mobileModules]);
	}

	if (isIsolatedMobileModule(moduleName)) {
		return resolveSourceFile(moduleName, [mobileModules]);
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
	cssEntryFile: "./src/global.css",
	debug: true,
});
