import type React from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";
import type {
	AgentConfig,
	AgentModelOption,
	AgentModelSection,
	PermissionModeLiteral,
	ProviderCapabilities,
	SendMessageStreamRequest,
} from "@/lib/remote";

const DEFAULT_MODEL_SECTIONS: AgentModelSection[] = [
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
				effortLevels: ["low", "medium", "high", "xhigh", "max"],
				supportsFastMode: true,
				supportsContextUsage: true,
			},
		],
	},
];

const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities[] = [
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
	{
		provider: "cursor",
		displayName: "Cursor",
		supportsPlanMode: false,
		supportsActiveGoal: false,
		supportsContextUsage: false,
		supportsSteer: false,
		supportsSlashCommands: true,
		requiresApiKey: true,
		permissionModes: ["default"],
	},
];

type ModelContextValue = {
	modelSections: readonly AgentModelSection[];
	providerCapabilities: readonly ProviderCapabilities[];
	selectedModelId: string;
	selectedModel: AgentModelOption | null;
	selectedCapabilities: ProviderCapabilities;
	effortLevel: string | null;
	permissionMode: PermissionModeLiteral;
	fastMode: boolean;
	configLoading: boolean;
	configError: string | null;
	setAgentConfig: (config: AgentConfig) => void;
	setConfigLoading: (loading: boolean) => void;
	setConfigError: (message: string | null) => void;
	selectModel: (modelId: string) => void;
	selectEffort: (level: string | null) => void;
	selectPermissionMode: (mode: PermissionModeLiteral) => void;
	setFastMode: (enabled: boolean) => void;
	buildSendOptions: () => Omit<SendMessageStreamRequest, "prompt">;
};

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: React.ReactNode }) {
	const [modelSections, setModelSections] = useState(DEFAULT_MODEL_SECTIONS);
	const [providerCapabilities, setProviderCapabilities] = useState(
		DEFAULT_PROVIDER_CAPABILITIES,
	);
	const [selectedModelId, setSelectedModelId] = useState("default");
	const [effortLevel, setEffortLevel] = useState<string | null>("high");
	const [permissionMode, setPermissionMode] =
		useState<PermissionModeLiteral>("bypassPermissions");
	const [fastMode, setFastMode] = useState(false);
	const [configLoading, setConfigLoading] = useState(false);
	const [configError, setConfigError] = useState<string | null>(null);

	const selectedModel = useMemo(
		() => findComposerModel(modelSections, selectedModelId),
		[modelSections, selectedModelId],
	);
	const selectedCapabilities = useMemo(
		() =>
			findComposerProviderCapabilities(
				providerCapabilities,
				selectedModel?.provider ?? "claude",
			),
		[providerCapabilities, selectedModel],
	);
	const effectiveEffort = clampComposerEffort(effortLevel, selectedModel);
	const effectivePermission = clampComposerPermission(
		permissionMode,
		selectedCapabilities,
	);

	const setAgentConfig = useCallback((config: AgentConfig) => {
		const nextSections =
			config.modelSections.length > 0
				? config.modelSections
				: DEFAULT_MODEL_SECTIONS;
		const nextCapabilities =
			config.providerCapabilities.length > 0
				? config.providerCapabilities
				: DEFAULT_PROVIDER_CAPABILITIES;

		setModelSections(nextSections);
		setProviderCapabilities(nextCapabilities);
		setSelectedModelId((current) => {
			if (findComposerModel(nextSections, current)) return current;
			return firstComposerModel(nextSections)?.id ?? "default";
		});
		setConfigError(null);
	}, []);

	const selectModel = useCallback(
		(modelId: string) => {
			const nextModel = findComposerModel(modelSections, modelId);
			if (!nextModel) return;
			setSelectedModelId(modelId);
			setEffortLevel((current) => clampComposerEffort(current, nextModel));
			setFastMode((current) =>
				nextModel.supportsFastMode === true ? current : false,
			);
			const nextCaps = findComposerProviderCapabilities(
				providerCapabilities,
				nextModel.provider,
			);
			setPermissionMode((current) =>
				clampComposerPermission(current, nextCaps),
			);
		},
		[modelSections, providerCapabilities],
	);

	const selectEffort = useCallback(
		(level: string | null) => {
			setEffortLevel(clampComposerEffort(level, selectedModel));
		},
		[selectedModel],
	);

	const selectPermissionMode = useCallback(
		(mode: PermissionModeLiteral) => {
			setPermissionMode(clampComposerPermission(mode, selectedCapabilities));
		},
		[selectedCapabilities],
	);

	const buildSendOptions = useCallback(
		() => ({
			modelId: selectedModel?.id ?? selectedModelId,
			effortLevel: effectiveEffort,
			permissionMode: effectivePermission,
			fastMode: selectedModel?.supportsFastMode === true ? fastMode : false,
		}),
		[
			effectiveEffort,
			effectivePermission,
			fastMode,
			selectedModel,
			selectedModelId,
		],
	);

	const value = useMemo(
		() => ({
			modelSections,
			providerCapabilities,
			selectedModelId,
			selectedModel,
			selectedCapabilities,
			effortLevel: effectiveEffort,
			permissionMode: effectivePermission,
			fastMode,
			configLoading,
			configError,
			setAgentConfig,
			setConfigLoading,
			setConfigError,
			selectModel,
			selectEffort,
			selectPermissionMode,
			setFastMode,
			buildSendOptions,
		}),
		[
			modelSections,
			providerCapabilities,
			selectedModelId,
			selectedModel,
			selectedCapabilities,
			effectiveEffort,
			effectivePermission,
			fastMode,
			configLoading,
			configError,
			setAgentConfig,
			selectModel,
			selectEffort,
			selectPermissionMode,
			buildSendOptions,
		],
	);

	return <ModelContext value={value}>{children}</ModelContext>;
}

export function useModel() {
	const context = use(ModelContext);
	if (!context) {
		throw new Error("useModel must be used within a ModelProvider");
	}
	return context;
}

export function findComposerModel(
	sections: readonly AgentModelSection[],
	modelId: string,
): AgentModelOption | null {
	for (const section of sections) {
		const option = section.options.find((model) => model.id === modelId);
		if (option) return option;
	}
	return null;
}

export function firstComposerModel(
	sections: readonly AgentModelSection[],
): AgentModelOption | null {
	return sections[0]?.options[0] ?? null;
}

export function findComposerProviderCapabilities(
	table: readonly ProviderCapabilities[],
	provider: string,
): ProviderCapabilities {
	return (
		table.find((caps) => caps.provider === provider) ??
		table.find((caps) => caps.provider === "claude") ??
		DEFAULT_PROVIDER_CAPABILITIES[0]
	);
}

export function clampComposerEffort(
	level: string | null,
	model: AgentModelOption | null,
): string | null {
	const levels = model?.effortLevels ?? [];
	if (levels.length === 0) return null;
	if (level && levels.includes(level)) return level;
	return levels.includes("high") ? "high" : levels[0];
}

export function clampComposerPermission(
	mode: PermissionModeLiteral,
	capabilities: ProviderCapabilities,
): PermissionModeLiteral {
	if (capabilities.permissionModes.includes(mode)) return mode;
	if (capabilities.permissionModes.includes("bypassPermissions")) {
		return "bypassPermissions";
	}
	return capabilities.permissionModes[0] ?? "default";
}
