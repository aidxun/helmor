import { describe, expect, test } from "bun:test";
import type { AgentModelSection, ProviderCapabilities } from "@/lib/remote";
import {
	clampComposerEffort,
	clampComposerPermission,
	findComposerModel,
	findComposerProviderCapabilities,
	firstComposerModel,
} from "./model-context";

const modelSections: AgentModelSection[] = [
	{
		id: "claude",
		label: "Claude Code",
		status: "ready",
		options: [
			{
				id: "default",
				provider: "claude",
				label: "Default",
				cliModel: "default",
				effortLevels: ["low", "medium", "high"],
				supportsFastMode: true,
				supportsContextUsage: true,
			},
		],
	},
	{
		id: "codex",
		label: "Codex",
		status: "ready",
		options: [
			{
				id: "gpt-5.2-codex",
				provider: "codex",
				label: "GPT-5.2 Codex",
				cliModel: "gpt-5.2-codex",
				effortLevels: [],
				supportsContextUsage: true,
			},
		],
	},
];

const capabilities: ProviderCapabilities[] = [
	{
		provider: "claude",
		displayName: "Claude",
		supportsPlanMode: true,
		supportsActiveGoal: false,
		supportsContextUsage: true,
		supportsSteer: true,
		supportsSlashCommands: true,
		requiresApiKey: false,
		permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"],
	},
	{
		provider: "codex",
		displayName: "Codex",
		supportsPlanMode: true,
		supportsActiveGoal: true,
		supportsContextUsage: true,
		supportsSteer: true,
		supportsSlashCommands: true,
		requiresApiKey: false,
		permissionModes: ["default", "bypassPermissions"],
	},
];

describe("mobile composer model helpers", () => {
	test("finds selected and fallback models across sections", () => {
		expect(findComposerModel(modelSections, "gpt-5.2-codex")?.provider).toBe(
			"codex",
		);
		expect(findComposerModel(modelSections, "missing")).toBe(null);
		expect(firstComposerModel(modelSections)?.id).toBe("default");
	});

	test("clamps effort to the selected model", () => {
		expect(clampComposerEffort("medium", modelSections[0].options[0])).toBe(
			"medium",
		);
		expect(clampComposerEffort("max", modelSections[0].options[0])).toBe(
			"high",
		);
		expect(clampComposerEffort("high", modelSections[1].options[0])).toBe(null);
	});

	test("falls back permissions through provider capabilities", () => {
		const codex = findComposerProviderCapabilities(capabilities, "codex");
		expect(clampComposerPermission("plan", codex)).toBe("bypassPermissions");
		expect(clampComposerPermission("default", codex)).toBe("default");

		const unknown = findComposerProviderCapabilities(capabilities, "future");
		expect(unknown.provider).toBe("claude");
		expect(clampComposerPermission("plan", unknown)).toBe("plan");
	});
});
