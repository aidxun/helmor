import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import {
	ChevronDown,
	GitBranch,
	Laptop,
	type LucideIcon,
	MessageCircle,
	Plus,
} from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import {
	modeFromTarget,
	targetForMode,
} from "@/features/workspaces/workspace-new-chat-target";
import type {
	AgentModelSection,
	MobileRepositoryOption,
	WorkspaceSendTarget,
} from "@/lib/remote";
import { cn } from "@/utils/tailwind";
import { formatEffort, formatEffortCompact } from "./composer-format";

export function ComposerModelMenu({
	label,
	modelSections,
	selectedModelId,
	onSelect,
}: {
	label: string;
	modelSections: readonly AgentModelSection[];
	selectedModelId: string;
	onSelect: (modelId: string) => void;
}) {
	const actions = useMemo<MenuAction[]>(
		() =>
			modelSections.map((section) => ({
				id: `section:${section.id}`,
				title: section.label,
				subactions: section.options.map((model) => ({
					id: model.id,
					title: model.label,
					image: "cpu",
					state: model.id === selectedModelId ? "on" : "off",
				})),
			})),
		[modelSections, selectedModelId],
	);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			onSelect(event.nativeEvent.event);
		},
		[onSelect],
	);

	return (
		<OptionMenu
			actions={actions}
			label={label}
			maxWidth={82}
			onPressAction={handlePress}
		/>
	);
}

export function ComposerAttachmentMenu({
	disabled,
	onCamera,
	onLibrary,
}: {
	disabled?: boolean;
	onCamera: () => void;
	onLibrary: () => void;
}) {
	const actions = useMemo<MenuAction[]>(
		() => [
			{
				id: "camera",
				title: "Take photo",
				image: "camera",
				attributes: { disabled },
			},
			{
				id: "library",
				title: "Choose from library",
				image: "photo",
				attributes: { disabled },
			},
		],
		[disabled],
	);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			if (disabled) return;
			if (event.nativeEvent.event === "camera") onCamera();
			if (event.nativeEvent.event === "library") onLibrary();
		},
		[disabled, onCamera, onLibrary],
	);

	return (
		<OptionMenu
			actions={actions}
			compact
			disabled={disabled}
			icon={Plus}
			maxWidth={30}
			onPressAction={handlePress}
			title="Add image"
		/>
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
	const targetByActionId = useMemo(() => {
		const repositoryArray = [...repositories];
		const next = new Map<string, WorkspaceSendTarget>();
		next.set("mode:chat", { kind: "chat" });
		next.set(
			"mode:worktree",
			targetForMode({
				mode: "worktree",
				target,
				repositories: repositoryArray,
			}),
		);
		next.set(
			"mode:local",
			targetForMode({ mode: "local", target, repositories: repositoryArray }),
		);
		return next;
	}, [repositories, target]);
	const actions = useMemo<MenuAction[]>(() => {
		const repositoryArray = [...repositories];
		const startActions: MenuAction[] = [
			{
				id: "mode:chat",
				title: "Chat",
				image: "bubble.left",
				state: mode === "chat" ? "on" : "off",
			},
			{
				id: "mode:worktree",
				title: "Worktree",
				image: "arrow.triangle.branch",
				state: mode === "worktree" ? "on" : "off",
				attributes: { disabled: repositoryArray.length === 0 },
			},
			{
				id: "mode:local",
				title: "Local",
				image: "laptopcomputer",
				state: mode === "local" ? "on" : "off",
				attributes: { disabled: repositoryArray.length === 0 },
			},
		];
		const actions: MenuAction[] = [
			{
				id: "section:start",
				title: "Start as",
				displayInline: true,
				subactions: startActions,
			},
		];
		return actions;
	}, [mode, repositories]);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			const nextTarget = targetByActionId.get(event.nativeEvent.event);
			if (nextTarget) onChange(nextTarget);
		},
		[onChange, targetByActionId],
	);

	return (
		<OptionMenu
			actions={actions}
			icon={targetIcon(target)}
			label={compactTargetLabel(target)}
			maxWidth={62}
			onPressAction={handlePress}
			title="New chat target"
		/>
	);
}

export function ComposerEffortMenu({
	level,
	levels,
	onSelect,
}: {
	level: string | null;
	levels: readonly string[];
	onSelect: (level: string) => void;
}) {
	const actions = useMemo<MenuAction[]>(
		() =>
			levels.map((option) => ({
				id: option,
				title: formatEffort(option),
				image: "brain",
				state: option === level ? "on" : "off",
			})),
		[levels, level],
	);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			onSelect(event.nativeEvent.event);
		},
		[onSelect],
	);

	if (!level || levels.length === 0) return null;
	return (
		<OptionMenu
			actions={actions}
			label={formatEffortCompact(level)}
			maxWidth={44}
			onPressAction={handlePress}
			title="Effort"
		/>
	);
}

function OptionMenu({
	actions,
	label,
	icon,
	disabled,
	compact,
	maxWidth,
	title,
	onPressAction,
}: {
	actions: MenuAction[];
	label?: string;
	icon?: LucideIcon;
	disabled?: boolean;
	compact?: boolean;
	maxWidth: number;
	title?: string;
	onPressAction: (event: { nativeEvent: { event: string } }) => void;
}) {
	const minWidth = compact ? 30 : Math.min(36, maxWidth);
	const frameStyle = {
		height: 30,
		maxWidth,
		minWidth,
	};
	const renderTrigger = (hidden = false) => (
		<View
			className={cn(
				"h-[30px] flex-row items-center justify-center rounded-full",
				compact ? "w-[30px]" : "px-1",
				disabled ? "opacity-45" : undefined,
			)}
			style={[frameStyle, hidden ? { opacity: 0 } : undefined]}
		>
			<View className="min-w-0 flex-row items-center justify-center gap-0.5">
				{icon ? (
					<Icon icon={icon} className="h-3.5 w-3.5 text-foreground" />
				) : null}
				{label ? (
					<Text
						numberOfLines={1}
						ellipsizeMode="tail"
						className="min-w-0 text-[12px] font-semibold text-foreground"
					>
						{label}
					</Text>
				) : null}
				{label ? (
					<Icon
						icon={ChevronDown}
						className="h-2.5 w-2.5 text-muted-foreground"
					/>
				) : null}
			</View>
		</View>
	);

	if (disabled) return renderTrigger();
	return (
		<View
			style={{
				height: 30,
				maxWidth,
				minWidth,
				justifyContent: "center",
				alignItems: "center",
				overflow: "visible",
			}}
		>
			{renderTrigger()}
			<MenuView
				actions={actions}
				onPressAction={onPressAction}
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					height: 30,
					maxWidth,
					minWidth,
				}}
				title={title}
			>
				{renderTrigger(true)}
			</MenuView>
		</View>
	);
}

function targetIcon(target: WorkspaceSendTarget) {
	if (target.kind === "chat") return MessageCircle;
	return target.mode === "local" ? Laptop : GitBranch;
}

function compactTargetLabel(target: WorkspaceSendTarget): string {
	if (target.kind === "chat") return "Chat";
	return target.mode === "local" ? "Local" : "Repo";
}
