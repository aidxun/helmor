import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const normalizedArgs = process.argv
	.slice(2)
	.map((arg) => arg.replace(/^[\u2012-\u2015]+/, "--"));

const expoBin = fileURLToPath(
	new URL(
		process.platform === "win32"
			? "../node_modules/.bin/expo.cmd"
			: "../node_modules/.bin/expo",
		import.meta.url,
	),
);

const child = spawn(
	existsSync(expoBin) ? expoBin : "expo",
	["run:ios", ...normalizedArgs],
	{
		stdio: "inherit",
		shell: process.platform === "win32",
	},
);

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 1);
});
