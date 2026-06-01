import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	base: "/mobile/",
	plugins: [react()],
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: {
			"@": path.resolve(__dirname, "./src"),
			react: path.resolve(__dirname, "../../node_modules/react"),
			"react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
			"react/jsx-runtime": path.resolve(
				__dirname,
				"../../node_modules/react/jsx-runtime.js",
			),
			"react/jsx-dev-runtime": path.resolve(
				__dirname,
				"../../node_modules/react/jsx-dev-runtime.js",
			),
		},
	},
	build: {
		outDir: "../../dist/mobile",
		emptyOutDir: true,
	},
});
