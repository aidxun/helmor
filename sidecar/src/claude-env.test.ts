import { describe, expect, it } from "bun:test";
import { claudeEnv } from "./claude-session-manager.js";

describe("claudeEnv", () => {
	it("isolates custom provider env from inherited Anthropic settings", () => {
		expect(
			claudeEnv(
				{
					ANTHROPIC_BASE_URL: "https://api.example.com/anthropic",
					ANTHROPIC_API_KEY: "sk-test",
					ANTHROPIC_DEFAULT_OPUS_MODEL: "xiaomi/mimo-v2.5",
				},
				{ CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1" },
			),
		).toEqual({
			ANTHROPIC_AUTH_TOKEN: "",
			ANTHROPIC_BASE_URL: "https://api.example.com/anthropic",
			ANTHROPIC_API_KEY: "sk-test",
			ANTHROPIC_MODEL: "",
			ANTHROPIC_SMALL_FAST_MODEL: "",
			ANTHROPIC_DEFAULT_OPUS_MODEL: "xiaomi/mimo-v2.5",
			ANTHROPIC_DEFAULT_SONNET_MODEL: "",
			ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
			ANTHROPIC_CUSTOM_HEADERS: "",
			CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1",
		});
	});

	it("leaves ordinary Claude sessions untouched except extra env", () => {
		expect(
			claudeEnv(undefined, {
				CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1",
			}),
		).toEqual({ CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1" });
	});
});
