import { ArrowUp, Zap } from "lucide-react-native";
import type React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import type {
	AgentModelSection,
	MobileRepositoryOption,
	WorkspaceSendTarget,
} from "@/lib/remote";
import { cn } from "@/utils/tailwind";
import {
	ComposerAttachmentMenu,
	ComposerEffortMenu,
	ComposerModelMenu,
	ComposerTargetMenu,
} from "./composer-option-menu";

export function ComposerToolbar({
	disabled,
	isGenerating,
	submitDisabled,
	target,
	repositories,
	modelLabel,
	modelSections,
	selectedModelId,
	effortLevel,
	effortLevels,
	supportsFastMode,
	fastMode,
	onCameraAttachment,
	onLibraryAttachment,
	onSubmit,
	onToggleFast,
	onChangeTarget,
	onSelectModel,
	onSelectEffort,
}: {
	disabled?: boolean;
	isGenerating: boolean;
	submitDisabled: boolean;
	target?: WorkspaceSendTarget;
	repositories: readonly MobileRepositoryOption[];
	modelLabel: string;
	modelSections: readonly AgentModelSection[];
	selectedModelId: string;
	effortLevel: string | null;
	effortLevels: readonly string[];
	supportsFastMode: boolean;
	fastMode: boolean;
	onCameraAttachment: () => void;
	onLibraryAttachment: () => void;
	onSubmit: () => void;
	onToggleFast: () => void;
	onChangeTarget: (target: WorkspaceSendTarget) => void;
	onSelectModel: (modelId: string) => void;
	onSelectEffort: (level: string) => void;
}) {
	return (
		<View className="min-h-10 flex-row items-center px-2 pb-2">
			<View className="h-8 min-w-0 flex-1 flex-row items-center justify-start gap-1 overflow-visible">
				<ComposerAttachmentMenu
					disabled={disabled || isGenerating}
					onCamera={onCameraAttachment}
					onLibrary={onLibraryAttachment}
				/>

				{supportsFastMode ? (
					<ComposerIconButton
						active={fastMode}
						disabled={disabled || isGenerating}
						onPress={onToggleFast}
					>
						<Icon
							icon={Zap}
							className={cn(
								"h-4 w-4",
								fastMode ? "text-background" : "text-foreground",
							)}
							strokeWidth={2}
						/>
					</ComposerIconButton>
				) : null}

				{target ? (
					<ComposerTargetMenu
						target={target}
						repositories={repositories}
						onChange={onChangeTarget}
					/>
				) : null}
				<ComposerModelMenu
					label={modelLabel}
					modelSections={modelSections}
					selectedModelId={selectedModelId}
					onSelect={onSelectModel}
				/>
				<ComposerEffortMenu
					level={effortLevel}
					levels={effortLevels}
					onSelect={onSelectEffort}
				/>
			</View>
			<Pressable
				onPress={onSubmit}
				disabled={submitDisabled}
				className={cn(
					"h-9 w-9 items-center justify-center rounded-full active:opacity-70",
					submitDisabled ? "bg-secondary" : "bg-foreground",
				)}
			>
				{isGenerating ? (
					<ActivityIndicator size="small" colorClassName="tint-background" />
				) : (
					<Icon
						icon={ArrowUp}
						className={cn(
							"h-4 w-4",
							submitDisabled ? "text-muted-foreground" : "text-background",
						)}
						strokeWidth={2.6}
					/>
				)}
			</Pressable>
		</View>
	);
}

function ComposerIconButton({
	children,
	disabled,
	active,
	onPress,
}: {
	children: React.ReactNode;
	disabled?: boolean;
	active?: boolean;
	onPress?: () => void;
}) {
	return (
		<Pressable
			disabled={disabled}
			hitSlop={4}
			onPress={onPress}
			className={cn(
				"h-[30px] w-[30px] items-center justify-center rounded-full active:opacity-70",
				active ? "bg-foreground" : "bg-secondary/60",
				disabled ? "opacity-45" : undefined,
			)}
		>
			{children}
		</Pressable>
	);
}
