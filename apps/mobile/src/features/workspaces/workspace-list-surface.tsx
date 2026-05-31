import {
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDotDashed,
	CircleX,
	ClipboardList,
	type LucideIcon,
	MessageCircle,
	MonitorUp,
	Pin,
	RefreshCw,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { cn } from "@/utils/tailwind";
import type { MobileWorkspaceGroup, MobileWorkspaceRow } from "./types";
import { useWorkspaces } from "./workspace-context";
import { workspaceStatusLabel, workspaceSubtitle } from "./workspace-selectors";

const GROUP_TONE_CLASS: Record<MobileWorkspaceGroup["tone"], string> = {
	"ai-tasks": "text-workspace-status-review",
	pinned: "text-workspace-status-neutral",
	chats: "text-muted-foreground",
	done: "text-workspace-status-done",
	review: "text-workspace-status-review",
	progress: "text-workspace-status-progress",
	backlog: "text-workspace-status-backlog",
	canceled: "text-workspace-status-canceled",
	archived: "text-muted-foreground",
};

const STATUS_DOT_CLASS: Record<MobileWorkspaceRow["status"], string> = {
	"in-progress": "bg-workspace-status-progress",
	review: "bg-workspace-status-review",
	done: "bg-workspace-status-done",
	backlog: "bg-workspace-status-backlog",
	canceled: "bg-workspace-status-canceled",
	archived: "bg-muted-foreground",
};

export function WorkspaceListSurface() {
	const {
		visibleGroups,
		selectedWorkspaceId,
		selectWorkspace,
		activeDesktop,
		syncStatus,
	} = useWorkspaces();

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			automaticallyAdjustContentInsets
			automaticallyAdjustsScrollIndicatorInsets
			contentContainerClassName="px-4 pt-4 pb-safe"
		>
			<View className="gap-1 pb-3">
				<Text className="text-[28px] font-bold text-foreground">
					Workspaces
				</Text>
				<Text numberOfLines={1} className="text-[13px] text-muted-foreground">
					{activeDesktop
						? `${activeDesktop.desktopName}${syncStatus === "syncing" ? " - syncing" : ""}`
						: "No desktop connected"}
				</Text>
			</View>

			{visibleGroups.length === 0 ? (
				<WorkspaceListEmpty
					connected={Boolean(activeDesktop)}
					syncing={syncStatus === "syncing"}
				/>
			) : (
				<View className="gap-4">
					{visibleGroups.map((group) => (
						<WorkspaceListGroup
							key={group.id}
							group={group}
							activeWorkspaceId={selectedWorkspaceId}
							onSelectWorkspace={selectWorkspace}
						/>
					))}
				</View>
			)}
		</ScrollView>
	);
}

function WorkspaceListGroup({
	group,
	activeWorkspaceId,
	onSelectWorkspace,
}: {
	group: MobileWorkspaceGroup;
	activeWorkspaceId: string | null;
	onSelectWorkspace: (workspaceId: string) => void;
}) {
	return (
		<View className="gap-1">
			<View className="flex-row items-center gap-2 px-2 pb-1">
				<GroupIcon group={group} />
				<Text className="flex-1 text-[13px] font-semibold text-muted-foreground">
					{group.label}
				</Text>
				<Text className="text-[12px] text-muted-foreground">
					{group.rows.length}
				</Text>
			</View>
			<View className="overflow-hidden rounded-[14px] border border-border bg-card">
				{group.rows.map((workspace, index) => (
					<WorkspaceListItem
						key={workspace.id}
						workspace={workspace}
						active={workspace.id === activeWorkspaceId}
						first={index === 0}
						onPress={() => onSelectWorkspace(workspace.id)}
					/>
				))}
			</View>
		</View>
	);
}

function GroupIcon({ group }: { group: MobileWorkspaceGroup }) {
	const className = cn("h-3.5 w-3.5", GROUP_TONE_CLASS[group.tone]);

	if (group.id === "chats") {
		return (
			<Icon icon={MessageCircle} className={className} strokeWidth={1.9} />
		);
	}

	const iconByTone: Partial<Record<MobileWorkspaceGroup["tone"], LucideIcon>> =
		{
			pinned: Pin,
			done: CircleCheck,
			review: CircleDotDashed,
			progress: CircleDashed,
			backlog: Circle,
			canceled: CircleX,
			"ai-tasks": ClipboardList,
			archived: CircleCheck,
		};

	return <Icon icon={iconByTone[group.tone] ?? Circle} className={className} />;
}

function WorkspaceListItem({
	workspace,
	onPress,
	active,
	first,
}: {
	workspace: MobileWorkspaceRow;
	onPress: () => void;
	active?: boolean;
	first?: boolean;
}) {
	const subtitle = workspaceSubtitle(workspace);
	const status = workspaceStatusLabel(workspace.status);

	return (
		<Pressable
			onPress={onPress}
			className={cn(
				"px-3 py-3 active:bg-accent",
				!first && "border-t border-border",
				active && "bg-muted",
			)}
		>
			<View className="flex-row items-start gap-3">
				<View
					className={cn(
						"mt-1.5 h-2.5 w-2.5 rounded-full",
						STATUS_DOT_CLASS[workspace.status],
						!workspace.hasUnread && "opacity-70",
					)}
				/>
				<View className="min-w-0 flex-1 gap-1">
					<Text
						numberOfLines={1}
						className={cn(
							"text-[16px]",
							active ? "font-semibold text-foreground" : "text-foreground",
						)}
					>
						{workspace.title}
					</Text>
					<Text numberOfLines={1} className="text-[13px] text-muted-foreground">
						{subtitle}
					</Text>
					<View className="flex-row items-center gap-2">
						<Text className="text-[12px] text-muted-foreground">{status}</Text>
						{workspace.unreadSessionCount > 0 ? (
							<Text className="rounded-full bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">
								{workspace.unreadSessionCount} unread
							</Text>
						) : null}
					</View>
				</View>
			</View>
		</Pressable>
	);
}

function WorkspaceListEmpty({
	connected,
	syncing,
}: {
	connected: boolean;
	syncing: boolean;
}) {
	const icon = syncing ? RefreshCw : MonitorUp;
	return (
		<View className="mt-10 items-center gap-2 rounded-[14px] border border-border bg-muted/40 px-5 py-8">
			<Icon icon={icon} className="h-6 w-6 text-muted-foreground" />
			<Text className="text-center text-[15px] font-semibold text-foreground">
				{connected
					? syncing
						? "Syncing workspaces"
						: "No workspaces synced"
					: "No desktop connected"}
			</Text>
			<Text className="text-center text-[13px] leading-5 text-muted-foreground">
				{connected
					? "Refresh after the desktop finishes loading workspace data."
					: "Pair a desktop to show its workspaces here."}
			</Text>
		</View>
	);
}
