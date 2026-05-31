import { useRouter } from "expo-router";
import {
	Activity,
	AlertCircle,
	Bot,
	Clock3,
	GitBranch,
	type LucideIcon,
	MessageSquare,
	MonitorUp,
	RefreshCw,
	Send,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { cn } from "@/utils/tailwind";
import type { MobileWorkspaceStatus } from "./types";
import { useWorkspaces } from "./workspace-context";

const STATUS_PILL_CLASS: Record<MobileWorkspaceStatus, string> = {
	"in-progress": "bg-workspace-status-progress",
	review: "bg-workspace-status-review",
	done: "bg-workspace-status-done",
	backlog: "bg-workspace-status-backlog",
	canceled: "bg-workspace-status-canceled",
	archived: "bg-muted-foreground",
};

export function WorkspaceSummarySurface() {
	return <WorkspaceSummaryContent showBacklogComposer />;
}

export function WorkspaceSummarySheet() {
	return <WorkspaceSummaryContent showBacklogComposer={false} />;
}

function WorkspaceSummaryContent({
	showBacklogComposer,
}: {
	showBacklogComposer: boolean;
}) {
	const {
		selectedWorkspace,
		selectedWorkspaceSummary,
		activeDesktop,
		syncStatus,
		syncError,
		visibleGroups,
		refreshWorkspaces,
		createBacklogTask,
	} = useWorkspaces();
	const router = useRouter();
	const [prompt, setPrompt] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);

	async function handleSendBacklog() {
		const text = prompt.trim();
		if (!text) return;
		setIsSending(true);
		setSendError(null);
		try {
			await createBacklogTask({
				prompt: text,
				title: text.slice(0, 60),
				mode: "chat",
			});
			setPrompt("");
		} catch (error) {
			setSendError(error instanceof Error ? error.message : String(error));
		} finally {
			setIsSending(false);
		}
	}

	if (!activeDesktop) {
		return (
			<WorkspaceEmptyState
				icon={MonitorUp}
				title="Connect a desktop"
				description="Scan the QR code from Helmor Desktop to sync workspaces."
				actionLabel="Open desktops"
				onAction={() => router.navigate("/(settings)/desktops")}
			/>
		);
	}

	if (!selectedWorkspace && syncStatus === "syncing") {
		return (
			<WorkspaceEmptyState
				icon={RefreshCw}
				title="Syncing workspaces"
				description={`Loading workspaces from ${activeDesktop.desktopName}.`}
			/>
		);
	}

	if (!selectedWorkspace && syncStatus === "error") {
		return (
			<WorkspaceEmptyState
				icon={AlertCircle}
				title="Could not sync workspaces"
				description={syncError ?? "Check the desktop connection and try again."}
				actionLabel="Retry"
				onAction={() => void refreshWorkspaces()}
			/>
		);
	}

	if (!selectedWorkspace && visibleGroups.length === 0) {
		return (
			<WorkspaceEmptyState
				icon={MonitorUp}
				title="No workspaces"
				description={`No visible workspaces were returned by ${activeDesktop.desktopName}.`}
				actionLabel="Refresh"
				onAction={() => void refreshWorkspaces()}
			/>
		);
	}

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			automaticallyAdjustContentInsets
			automaticallyAdjustsScrollIndicatorInsets
			contentContainerClassName="px-5 pt-6 pb-safe gap-4"
		>
			<View className="gap-3">
				<View className="flex-row flex-wrap items-center gap-2">
					<SummaryPill
						label={selectedWorkspaceSummary.statusLabel}
						status={selectedWorkspace?.status}
					/>
					<SummaryPill
						label={selectedWorkspaceSummary.stateLabel}
						muted={selectedWorkspace?.state === "ready"}
					/>
					<SummaryPill label={selectedWorkspaceSummary.modeLabel} muted />
				</View>

				<View className="gap-2">
					<Text
						selectable
						className="text-[32px] font-bold leading-9 text-foreground"
					>
						{selectedWorkspaceSummary.title}
					</Text>
					<View className="flex-row items-center gap-2">
						<Icon icon={GitBranch} className="h-4 w-4 text-muted-foreground" />
						<Text
							selectable
							numberOfLines={1}
							className="flex-1 text-[15px] text-muted-foreground"
						>
							{selectedWorkspaceSummary.subtitle}
						</Text>
					</View>
				</View>

				<Text
					selectable
					className="text-[16px] leading-6 text-muted-foreground"
				>
					{selectedWorkspaceSummary.description}
				</Text>
			</View>

			<View className="flex-row gap-3">
				<MetricTile
					label="Sessions"
					value={selectedWorkspace?.sessionCount ?? 0}
					caption={selectedWorkspaceSummary.sessionCountLabel}
				/>
				<MetricTile
					label="Messages"
					value={selectedWorkspace?.messageCount ?? 0}
					caption={selectedWorkspaceSummary.messageCountLabel}
				/>
			</View>

			<SummarySection title="Activity">
				<SummaryRow
					icon={MessageSquare}
					label="Unread"
					value={selectedWorkspaceSummary.unreadLabel}
					strong={Boolean(selectedWorkspace?.hasUnread)}
				/>
				<SummaryRow
					icon={Activity}
					label="Active session"
					value={selectedWorkspaceSummary.activeSessionLabel}
				/>
				<SummaryRow
					icon={Bot}
					label="Primary session"
					value={selectedWorkspaceSummary.primarySessionLabel}
				/>
				<SummaryRow
					icon={Clock3}
					label="Updated"
					value={selectedWorkspaceSummary.updatedLabel}
				/>
			</SummarySection>

			{showBacklogComposer ? (
				<View className="rounded-2xl bg-card border border-border border-continuous overflow-hidden">
					<View className="px-4 pt-4 pb-2">
						<Text className="text-[13px] font-semibold text-muted-foreground">
							Send to backlog
						</Text>
					</View>
					<View className="gap-3 px-4 pb-4">
						<TextInput
							value={prompt}
							onChangeText={setPrompt}
							editable={Boolean(activeDesktop) && !isSending}
							multiline
							placeholder={
								activeDesktop
									? "Task for later"
									: "Connect a desktop to send tasks"
							}
							placeholderTextColor="rgb(130 130 130)"
							className="min-h-24 rounded-xl border border-border bg-background px-3 py-3 text-[15px] text-foreground"
							textAlignVertical="top"
						/>
						<View className="flex-row items-center gap-3">
							<Pressable
								onPress={() => void handleSendBacklog()}
								disabled={!activeDesktop || !prompt.trim() || isSending}
								className="flex-row items-center gap-2 rounded-full bg-foreground px-4 py-2 active:opacity-70 disabled:opacity-40"
							>
								<Icon icon={Send} className="h-4 w-4 text-background" />
								<Text className="font-semibold text-background">
									{isSending ? "Sending" : "Send"}
								</Text>
							</Pressable>
							{sendError ? (
								<Text className="flex-1 text-[13px] text-destructive">
									{sendError}
								</Text>
							) : null}
						</View>
					</View>
				</View>
			) : null}
		</ScrollView>
	);
}

function WorkspaceEmptyState({
	icon,
	title,
	description,
	actionLabel,
	onAction,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
	actionLabel?: string;
	onAction?: () => void;
}) {
	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			automaticallyAdjustContentInsets
			automaticallyAdjustsScrollIndicatorInsets
			contentContainerClassName="flex-grow items-center justify-center gap-5 px-6 py-safe"
		>
			<View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
				<Icon icon={icon} className="h-7 w-7 text-muted-foreground" />
			</View>
			<View className="max-w-sm items-center gap-2">
				<Text className="text-center text-[26px] font-bold text-foreground">
					{title}
				</Text>
				<Text className="text-center text-[15px] leading-6 text-muted-foreground">
					{description}
				</Text>
			</View>
			{actionLabel && onAction ? (
				<Pressable
					onPress={onAction}
					className="rounded-full bg-foreground px-5 py-2.5 active:opacity-70"
				>
					<Text className="text-[15px] font-semibold text-background">
						{actionLabel}
					</Text>
				</Pressable>
			) : null}
		</ScrollView>
	);
}

function SummaryPill({
	label,
	muted,
	status,
}: {
	label: string;
	muted?: boolean;
	status?: MobileWorkspaceStatus;
}) {
	return (
		<View
			className={cn(
				"rounded-full px-3 py-1.5 border-continuous",
				status
					? STATUS_PILL_CLASS[status]
					: muted
						? "bg-muted"
						: "bg-foreground",
			)}
		>
			<Text
				className={cn(
					"text-[12px] font-semibold",
					muted ? "text-muted-foreground" : "text-background",
				)}
			>
				{label}
			</Text>
		</View>
	);
}

function MetricTile({
	label,
	value,
	caption,
}: {
	label: string;
	value: number;
	caption: string;
}) {
	return (
		<View className="flex-1 rounded-2xl bg-card p-4 border border-border border-continuous">
			<Text className="text-[13px] text-muted-foreground">{label}</Text>
			<Text
				className="pt-1 text-[28px] font-semibold text-foreground"
				style={{ fontVariant: ["tabular-nums"] }}
			>
				{value}
			</Text>
			<Text numberOfLines={1} className="text-[12px] text-muted-foreground">
				{caption}
			</Text>
		</View>
	);
}

function SummarySection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<View className="rounded-2xl bg-card border border-border border-continuous overflow-hidden">
			<View className="px-4 pt-4 pb-2">
				<Text className="text-[13px] font-semibold text-muted-foreground">
					{title}
				</Text>
			</View>
			{children}
		</View>
	);
}

function SummaryRow({
	icon,
	label,
	value,
	strong,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<View className="flex-row items-center gap-3 px-4 py-3 border-t border-border">
			<Icon icon={icon} className="h-4 w-4 text-muted-foreground" />
			<Text className="flex-1 text-[15px] text-muted-foreground">{label}</Text>
			<Text
				numberOfLines={1}
				className={cn(
					"max-w-[58%] text-right text-[15px]",
					strong ? "font-semibold text-foreground" : "text-foreground",
				)}
			>
				{value}
			</Text>
		</View>
	);
}
