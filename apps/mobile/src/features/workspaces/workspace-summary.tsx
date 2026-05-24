import {
	Activity,
	Bot,
	Clock3,
	GitBranch,
	type LucideIcon,
	MessageSquare,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
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
};

export function WorkspaceSummarySurface() {
	const { selectedWorkspace, selectedWorkspaceSummary } = useWorkspaces();

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
