import { ArrowUp, Zap } from "lucide-react-native";
import type React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
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
		<View className="min-h-11 flex-row items-center gap-1.5 px-2 pb-2">
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

			<View className="min-w-0 flex-1 flex-row items-center justify-center gap-1">
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
					"h-10 w-10 items-center justify-center rounded-full active:opacity-70",
					submitDisabled ? "bg-secondary" : "bg-foreground",
				)}
			>
				{isGenerating ? (
					<ActivityIndicator size="small" colorClassName="tint-background" />
				) : (
					<Icon
						icon={ArrowUp}
						className={cn(
							"h-[18px] w-[18px]",
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
		<TouchableGlass
			disabled={disabled}
			hitSlop={4}
			onPress={onPress}
			className={active ? "bg-foreground" : undefined}
			style={{
				width: 34,
				height: 34,
				borderRadius: 17,
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			{children}
		</TouchableGlass>
	);
}
