import { useLocalSearchParams, useRouter } from "expo-router";
import {
	Brain,
	Check,
	Cpu,
	type LucideIcon,
	ShieldCheck,
} from "lucide-react-native";
import type React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import { useModel } from "@/components/model-context";
import type { AgentModelOption, PermissionModeLiteral } from "@/lib/remote";
import { cn } from "@/utils/tailwind";

type ComposerOptionKind = "model" | "effort" | "permissions";

export default function ComposerOptionsSheet() {
	const params = useLocalSearchParams<{ kind?: string }>();
	const kind = parseKind(params.kind);
	const router = useRouter();
	const {
		modelSections,
		selectedModelId,
		selectedModel,
		selectedCapabilities,
		effortLevel,
		permissionMode,
		configError,
		selectModel,
		selectEffort,
		selectPermissionMode,
	} = useModel();
	const effortLevels = selectedModel?.effortLevels ?? [];

	return (
		<ScrollView
			className="flex-1"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="android:pb-safe pb-6"
		>
			<AndroidGrabber />
			<View className="px-5 pb-2 pt-2">
				<View className="flex-row items-center gap-2">
					<Icon icon={iconForKind(kind)} className="h-5 w-5 text-foreground" />
					<Text className="text-[28px] font-bold text-foreground">
						{titleForKind(kind)}
					</Text>
				</View>
				<Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
					{descriptionForKind(kind)}
				</Text>
			</View>

			{configError ? (
				<View className="mx-5 mb-3 rounded-2xl bg-muted px-3 py-2">
					<Text className="text-[12px] leading-4 text-muted-foreground">
						{configError}
					</Text>
				</View>
			) : null}

			{kind === "model" ? (
				<ModelOptions
					modelSections={modelSections}
					selectedModelId={selectedModelId}
					onSelect={(modelId) => {
						selectModel(modelId);
						router.back();
					}}
				/>
			) : null}

			{kind === "effort" ? (
				<EffortOptions
					levels={effortLevels}
					selected={effortLevel}
					onSelect={(level) => {
						selectEffort(level);
						router.back();
					}}
				/>
			) : null}

			{kind === "permissions" ? (
				<PermissionOptions
					modes={selectedCapabilities.permissionModes}
					selected={permissionMode}
					onSelect={(mode) => {
						selectPermissionMode(mode);
						router.back();
					}}
				/>
			) : null}
		</ScrollView>
	);
}

function ModelOptions({
	modelSections,
	selectedModelId,
	onSelect,
}: {
	modelSections: readonly {
		id: string;
		label: string;
		options: readonly AgentModelOption[];
	}[];
	selectedModelId: string;
	onSelect: (modelId: string) => void;
}) {
	return (
		<>
			{modelSections.map((section) => (
				<View key={section.id} className="mb-2">
					<Text className="px-5 pb-1 text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
						{section.label}
					</Text>
					{section.options.map((model) => (
						<OptionRow
							key={model.id}
							title={model.label}
							subtitle={model.id}
							selected={model.id === selectedModelId}
							onPress={() => onSelect(model.id)}
							leading={
								<View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
									<Text className="text-[11px] font-bold text-foreground">
										{model.provider.slice(0, 2).toUpperCase()}
									</Text>
								</View>
							}
						/>
					))}
				</View>
			))}
		</>
	);
}

function EffortOptions({
	levels,
	selected,
	onSelect,
}: {
	levels: readonly string[];
	selected: string | null;
	onSelect: (level: string) => void;
}) {
	if (levels.length === 0) {
		return (
			<EmptyState message="The selected model does not expose effort levels." />
		);
	}

	return (
		<View className="px-5">
			<View className="flex-row flex-wrap gap-2">
				{levels.map((level) => (
					<Pressable
						key={level}
						onPress={() => onSelect(level)}
						className={cn(
							"h-10 flex-row items-center gap-2 rounded-full px-4 active:opacity-70",
							level === selected ? "bg-foreground" : "bg-muted",
						)}
					>
						<Text
							className={cn(
								"text-[14px] font-medium",
								level === selected ? "text-background" : "text-foreground",
							)}
						>
							{formatEffort(level)}
						</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
}

function PermissionOptions({
	modes,
	selected,
	onSelect,
}: {
	modes: readonly PermissionModeLiteral[];
	selected: PermissionModeLiteral;
	onSelect: (mode: PermissionModeLiteral) => void;
}) {
	return (
		<View>
			{modes.map((mode) => (
				<OptionRow
					key={mode}
					title={permissionTitle(mode)}
					subtitle={permissionDescription(mode)}
					selected={mode === selected}
					onPress={() => onSelect(mode)}
				/>
			))}
		</View>
	);
}

function OptionRow({
	title,
	subtitle,
	selected,
	onPress,
	leading,
}: {
	title: string;
	subtitle: string;
	selected: boolean;
	onPress: () => void;
	leading?: React.ReactNode;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="flex-row items-center gap-3 px-5 py-3 active:bg-muted"
		>
			{leading}
			<View className="min-w-0 flex-1">
				<Text
					numberOfLines={1}
					className="text-[16px] font-semibold text-foreground"
				>
					{title}
				</Text>
				<Text numberOfLines={2} className="text-[12px] text-muted-foreground">
					{subtitle}
				</Text>
			</View>
			{selected ? (
				<Icon icon={Check} className="h-5 w-5 text-foreground" />
			) : null}
		</Pressable>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<View className="mx-5 rounded-2xl bg-muted px-4 py-4">
			<Text className="text-[13px] leading-5 text-muted-foreground">
				{message}
			</Text>
		</View>
	);
}

function parseKind(value: string | string[] | undefined): ComposerOptionKind {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw === "effort" || raw === "permissions") return raw;
	return "model";
}

function iconForKind(kind: ComposerOptionKind): LucideIcon {
	if (kind === "effort") return Brain;
	if (kind === "permissions") return ShieldCheck;
	return Cpu;
}

function titleForKind(kind: ComposerOptionKind): string {
	if (kind === "effort") return "Effort";
	if (kind === "permissions") return "Permissions";
	return "Model";
}

function descriptionForKind(kind: ComposerOptionKind): string {
	if (kind === "effort") return "Choose how much reasoning to spend.";
	if (kind === "permissions") return "Choose what the agent may do.";
	return "Choose the model for the next mobile prompt.";
}

function formatEffort(level: string): string {
	if (level === "xhigh") return "Extra High";
	return level.slice(0, 1).toUpperCase() + level.slice(1);
}

function permissionTitle(mode: PermissionModeLiteral): string {
	switch (mode) {
		case "acceptEdits":
			return "Accept edits";
		case "plan":
			return "Plan";
		case "bypassPermissions":
			return "Bypass permissions";
		default:
			return "Default";
	}
}

function permissionDescription(mode: PermissionModeLiteral): string {
	switch (mode) {
		case "acceptEdits":
			return "Allow file edits while still asking for sensitive actions.";
		case "plan":
			return "Ask the agent to draft a plan before implementation.";
		case "bypassPermissions":
			return "Let the agent proceed without approval prompts.";
		default:
			return "Use the provider's normal desktop behavior.";
	}
}
