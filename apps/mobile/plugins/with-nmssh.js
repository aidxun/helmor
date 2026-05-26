const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const POD_LINE = "  pod 'NMSSH', :git => 'https://github.com/aanah0/NMSSH.git'";

module.exports = function withNmssh(config) {
	return withDangerousMod(config, [
		"ios",
		async (nextConfig) => {
			const podfile = path.join(
				nextConfig.modRequest.platformProjectRoot,
				"Podfile",
			);
			if (!fs.existsSync(podfile)) return nextConfig;

			const current = fs.readFileSync(podfile, "utf8");
			if (current.includes("github.com/aanah0/NMSSH")) return nextConfig;

			const next = current.replace(
				/(target ['"][^'"]+['"] do\n)/,
				`$1${POD_LINE}\n`,
			);
			fs.writeFileSync(podfile, next);
			return nextConfig;
		},
	]);
};
