import { Pressable, Text } from "react-native";
import {
	modeFromTarget,
	targetForMode,
} from "@/features/workspaces/workspace-new-chat-target";
import type {
	AgentModelSection,
	MobileRepositoryOption,
	WorkspaceSendTarget,
} from "@/lib/remote";
import { formatEffortCompact, labelForTarget } from "./composer-format";

type MenuButtonProps = {
	label: string;
	onPress?: () => void;
};

function FallbackMenuButton({ label, onPress }: MenuButtonProps) {
	return (
		<Pressable
			onPress={onPress}
			className="h-8 max-w-[112px] items-center justify-center rounded-full px-2 active:opacity-70"
		>
			<Text
				numberOfLines={1}
				className="text-[12px] font-semibold text-foreground"
			>
				{label}
			</Text>
		</Pressable>
	);
}

export function ComposerModelMenu({
	label,
}: {
	label: string;
	modelSections: readonly AgentModelSection[];
	selectedModelId: string;
	onSelect: (modelId: string) => void;
}) {
	return <FallbackMenuButton label={label} />;
}

export function ComposerAttachmentMenu({
	disabled,
	onLibrary,
}: {
	disabled?: boolean;
	onCamera: () => void;
	onLibrary: () => void;
}) {
	return (
		<FallbackMenuButton label="+" onPress={disabled ? undefined : onLibrary} />
	);
}

export function ComposerTargetMenu({
	target,
	repositories,
	onChange,
}: {
	target: WorkspaceSendTarget;
	repositories: readonly MobileRepositoryOption[];
	onChange: (target: WorkspaceSendTarget) => void;
}) {
	const mode = modeFromTarget(target);
	const nextMode =
		mode === "chat" ? "worktree" : mode === "worktree" ? "local" : "chat";
	return (
		<FallbackMenuButton
			label={labelForTarget(target) ?? "Just Chat"}
			onPress={() =>
				onChange(
					targetForMode({
						mode: nextMode,
						target,
						repositories: [...repositories],
					}),
				)
			}
		/>
	);
}

export function ComposerEffortMenu({
	level,
}: {
	level: string | null;
	levels: readonly string[];
	onSelect: (level: string) => void;
}) {
	if (!level) return null;
	return <FallbackMenuButton label={formatEffortCompact(level)} />;
}
