import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import {
	ChevronDown,
	GitBranch,
	GitFork,
	GitMerge,
	type LucideIcon,
	MessageCircle,
} from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import type { MobileRepositoryOption, WorkspaceSendTarget } from "@/lib/remote";
import {
	targetForBranch,
	targetForBranchIntent,
	targetForRepository,
} from "./workspace-new-chat-target";

export function NewChatStartPage({
	repositories,
	target,
	onChangeTarget,
}: {
	repositories: readonly MobileRepositoryOption[];
	target: WorkspaceSendTarget;
	onChangeTarget: (target: WorkspaceSendTarget) => void;
}) {
	return (
		<View className="w-full max-w-[380px] items-center gap-3 px-6">
			<View className="h-12 w-12 items-center justify-center rounded-2xl bg-foreground">
				<Icon icon={MessageCircle} className="h-5 w-5 text-background" />
			</View>
			<Text className="text-center text-[30px] font-bold text-foreground">
				New chat
			</Text>
			<Text className="max-w-[320px] text-center text-[14px] leading-5 text-muted-foreground">
				Start a standalone conversation or attach the first prompt to a
				repository from the composer.
			</Text>
			{target.kind === "repo" ? (
				<RepositoryPicker
					repositories={repositories}
					target={target}
					onChangeTarget={onChangeTarget}
				/>
			) : null}
		</View>
	);
}

function RepositoryPicker({
	repositories,
	target,
	onChangeTarget,
}: {
	repositories: readonly MobileRepositoryOption[];
	target: Extract<WorkspaceSendTarget, { kind: "repo" }>;
	onChangeTarget: (target: WorkspaceSendTarget) => void;
}) {
	const selected =
		repositories.find((repo) => repo.id === target.repoId) ?? repositories[0];
	const actions = useMemo<MenuAction[]>(
		() =>
			repositories.map((repo) => ({
				id: repo.id,
				title: repo.name,
				image: "folder",
				state: repo.id === selected?.id ? "on" : "off",
			})),
		[repositories, selected?.id],
	);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			onChangeTarget(
				targetForRepository({
					repoId: event.nativeEvent.event,
					target,
					repositories: [...repositories],
				}),
			);
		},
		[onChangeTarget, repositories, target],
	);

	if (!selected) {
		return (
			<Text className="mt-2 rounded-2xl bg-muted px-4 py-3 text-center text-[13px] leading-5 text-muted-foreground">
				Sync a repository from your desktop before starting a repository chat.
			</Text>
		);
	}

	return (
		<View className="mt-2 w-full max-w-[320px] items-center gap-2">
			<Text className="text-[11px] font-semibold uppercase text-muted-foreground">
				Workspace source
			</Text>
			<View className="flex-row flex-wrap justify-center gap-2">
				<MenuView
					actions={actions}
					onPressAction={handlePress}
					style={{ minHeight: 32 }}
					title="Repository"
				>
					<PickerChip
						iconText={
							selected.repoInitials ?? selected.name.slice(0, 2).toUpperCase()
						}
						label="Repo"
						value={selected.name}
					/>
				</MenuView>
				<BranchPicker
					repository={selected}
					target={target}
					repositories={repositories}
					onChangeTarget={onChangeTarget}
				/>
				{target.mode === "worktree" ? (
					<BranchIntentPicker target={target} onChangeTarget={onChangeTarget} />
				) : null}
			</View>
		</View>
	);
}

function BranchPicker({
	repository,
	repositories,
	target,
	onChangeTarget,
}: {
	repository: MobileRepositoryOption;
	repositories: readonly MobileRepositoryOption[];
	target: Extract<WorkspaceSendTarget, { kind: "repo" }>;
	onChangeTarget: (target: WorkspaceSendTarget) => void;
}) {
	const branches = repository.branches ?? [];
	const selectedBranch =
		target.sourceBranch ??
		(target.mode === "local" ? repository.currentBranch : null) ??
		repository.defaultBranch ??
		branches[0]?.name ??
		"main";
	const actions = useMemo<MenuAction[]>(
		() =>
			branches.map((branch) => ({
				id: branch.name,
				title: branch.name,
				image: branch.hasLocal ? "arrow.triangle.branch" : "cloud",
				state: branch.name === selectedBranch ? "on" : "off",
			})),
		[branches, selectedBranch],
	);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			onChangeTarget(
				targetForBranch({
					branch: event.nativeEvent.event,
					target,
					repositories: [...repositories],
				}),
			);
		},
		[onChangeTarget, repositories, target],
	);

	if (branches.length === 0) {
		return (
			<PickerChip
				icon={GitBranch}
				label="Branch"
				value={selectedBranch}
				disabled
			/>
		);
	}

	return (
		<MenuView
			actions={actions}
			onPressAction={handlePress}
			style={{ minHeight: 32 }}
			title="Branch"
		>
			<PickerChip icon={GitBranch} label="Branch" value={selectedBranch} />
		</MenuView>
	);
}

function BranchIntentPicker({
	target,
	onChangeTarget,
}: {
	target: Extract<WorkspaceSendTarget, { kind: "repo" }>;
	onChangeTarget: (target: WorkspaceSendTarget) => void;
}) {
	const branchIntent =
		target.branchIntent === "use_branch" ? "use_branch" : "from_branch";
	const actions = useMemo<MenuAction[]>(
		() => [
			{
				id: "from_branch",
				title: "Branch off",
				image: "arrow.triangle.branch",
				state: branchIntent === "from_branch" ? "on" : "off",
			},
			{
				id: "use_branch",
				title: "Use branch",
				image: "arrow.triangle.merge",
				state: branchIntent === "use_branch" ? "on" : "off",
			},
		],
		[branchIntent],
	);
	const handlePress = useCallback(
		(event: { nativeEvent: { event: string } }) => {
			const next =
				event.nativeEvent.event === "use_branch" ? "use_branch" : "from_branch";
			onChangeTarget(targetForBranchIntent({ branchIntent: next, target }));
		},
		[onChangeTarget, target],
	);
	return (
		<MenuView
			actions={actions}
			onPressAction={handlePress}
			style={{ minHeight: 32 }}
			title="Worktree mode"
		>
			<PickerChip
				icon={branchIntent === "use_branch" ? GitMerge : GitFork}
				label="Mode"
				value={branchIntent === "use_branch" ? "Use branch" : "Branch off"}
			/>
		</MenuView>
	);
}

function PickerChip({
	icon: IconComponent,
	iconText,
	label,
	value,
	disabled,
}: {
	icon?: LucideIcon;
	iconText?: string;
	label: string;
	value: string;
	disabled?: boolean;
}) {
	return (
		<View
			className="h-7 flex-row items-center gap-1 rounded-full border border-border bg-card/90 px-2"
			style={{ maxWidth: chipMaxWidth(label) }}
		>
			<View className="h-[18px] w-[18px] items-center justify-center rounded-full bg-muted">
				{IconComponent ? (
					<Icon icon={IconComponent} className="h-2.5 w-2.5 text-foreground" />
				) : (
					<Text className="text-[8px] font-semibold text-foreground">
						{iconText}
					</Text>
				)}
			</View>
			<Text
				numberOfLines={1}
				className="text-[11px] font-semibold text-foreground"
				style={{ maxWidth: chipTextMaxWidth(label) }}
			>
				<Text className="font-medium text-muted-foreground">{label}</Text>
				{" · "}
				{value}
			</Text>
			{disabled ? null : (
				<Icon
					icon={ChevronDown}
					className="h-2.5 w-2.5 text-muted-foreground"
				/>
			)}
		</View>
	);
}

function chipMaxWidth(label: string): number {
	if (label === "Branch") return 172;
	if (label === "Mode") return 156;
	return 150;
}

function chipTextMaxWidth(label: string): number {
	if (label === "Branch") return 126;
	if (label === "Mode") return 110;
	return 104;
}
