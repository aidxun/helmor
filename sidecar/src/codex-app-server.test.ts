import { describe, expect, test } from "bun:test";
import {
	applyMacSystemProxySettings,
	buildCodexAppServerArgs,
} from "./codex-app-server.js";

describe("buildCodexAppServerArgs", () => {
	test("disables Codex native notifications without disabling websocket transport", () => {
		expect(buildCodexAppServerArgs()).toEqual([
			"app-server",
			"-c",
			"notify=[]",
		]);
	});
});

describe("applyMacSystemProxySettings", () => {
	test("fills proxy env from enabled macOS system proxy settings", () => {
		const env: NodeJS.ProcessEnv = {};

		applyMacSystemProxySettings(
			env,
			`
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7890
  SOCKSProxy : 127.0.0.1
}
`,
		);

		expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.ALL_PROXY).toBe("socks5://127.0.0.1:7890");
	});

	test("fills no_proxy from macOS proxy exceptions", () => {
		const env: NodeJS.ProcessEnv = {};

		applyMacSystemProxySettings(
			env,
			`
<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : localhost
    2 : *.local
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
}
`,
		);

		expect(env.NO_PROXY).toBe("127.0.0.1,localhost,.local");
	});

	test("preserves explicit proxy env values", () => {
		const env: NodeJS.ProcessEnv = {
			HTTPS_PROXY: "http://proxy.example:8080",
		};

		applyMacSystemProxySettings(
			env,
			`
<dictionary> {
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
}
`,
		);

		expect(env.HTTPS_PROXY).toBe("http://proxy.example:8080");
	});

	test("fills missing proxy env values when another proxy env already exists", () => {
		const env: NodeJS.ProcessEnv = {
			HTTP_PROXY: "http://proxy.example:8080",
		};

		applyMacSystemProxySettings(
			env,
			`
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
}
`,
		);

		expect(env.HTTP_PROXY).toBe("http://proxy.example:8080");
		expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
	});

	test("preserves explicit no_proxy env values", () => {
		const env: NodeJS.ProcessEnv = {
			NO_PROXY: "metadata.google.internal",
		};

		applyMacSystemProxySettings(
			env,
			`
<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
  }
}
`,
		);

		expect(env.NO_PROXY).toBe("metadata.google.internal");
	});
});
