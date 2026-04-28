import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSettings } from "./settings";

const mockedInvoke = vi.mocked(invoke);

describe("saveSettings", () => {
	beforeEach(() => {
		mockedInvoke.mockClear();
	});

	it("serializes custom provider settings as JSON", async () => {
		await saveSettings({
			customProviders: [
				{
					id: "mioffice",
					name: "Mioffice",
					baseUrl: "https://api.llm.mioffice.cn/anthropic",
					apiKey: "sk-test",
					models: ["xiaomi/mimo-v2.5"],
					enabled: true,
				},
			],
		});

		expect(mockedInvoke).toHaveBeenCalledWith("update_app_settings", {
			settingsMap: {
				"app.custom_providers": JSON.stringify([
					{
						id: "mioffice",
						name: "Mioffice",
						baseUrl: "https://api.llm.mioffice.cn/anthropic",
						apiKey: "sk-test",
						models: ["xiaomi/mimo-v2.5"],
						enabled: true,
					},
				]),
			},
		});
	});
});
