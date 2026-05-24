import type {
	MobileWorkspaceGroup,
	MobileWorkspaceGroupId,
	MobileWorkspaceRow,
	MobileWorkspaceSummary,
} from "./types";

const GROUP_ORDER: MobileWorkspaceGroupId[] = [
	"pinned",
	"chats",
	"done",
	"review",
	"progress",
	"backlog",
	"canceled",
];

const STATUS_LABELS: Record<MobileWorkspaceRow["status"], string> = {
	"in-progress": "In progress",
	done: "Done",
	review: "In review",
	backlog: "Backlog",
	canceled: "Canceled",
};

const STATE_LABELS: Record<MobileWorkspaceRow["state"], string> = {
	initializing: "Initializing",
	setup_pending: "Setup pending",
	ready: "Ready",
	archived: "Archived",
};

const MODE_LABELS: Record<MobileWorkspaceRow["mode"], string> = {
	worktree: "Worktree",
	local: "Local",
	chat: "Chat",
};

const groupRank = new Map(GROUP_ORDER.map((id, index) => [id, index] as const));

export function getVisibleWorkspaceGroups(
	groups: MobileWorkspaceGroup[],
): MobileWorkspaceGroup[] {
	return [...groups]
		.filter((group) => group.rows.length > 0)
		.sort((left, right) => {
			return (groupRank.get(left.id) ?? 999) - (groupRank.get(right.id) ?? 999);
		});
}

export function flattenWorkspaceGroups(
	groups: MobileWorkspaceGroup[],
): MobileWorkspaceRow[] {
	return getVisibleWorkspaceGroups(groups).flatMap((group) => group.rows);
}

export function getDefaultWorkspaceId(
	groups: MobileWorkspaceGroup[],
): string | null {
	return flattenWorkspaceGroups(groups)[0]?.id ?? null;
}

export function getWorkspaceById(
	groups: MobileWorkspaceGroup[],
	workspaceId: string | null | undefined,
): MobileWorkspaceRow | null {
	if (!workspaceId) return null;
	return (
		flattenWorkspaceGroups(groups).find((row) => row.id === workspaceId) ?? null
	);
}

export function getWorkspaceSummary(
	workspace: MobileWorkspaceRow | null | undefined,
): MobileWorkspaceSummary {
	if (!workspace) {
		return {
			title: "No workspace selected",
			subtitle: "Select a workspace from the drawer",
			statusLabel: "Unknown",
			stateLabel: "Unknown",
			modeLabel: "Unknown",
			sessionCountLabel: "0 sessions",
			messageCountLabel: "0 messages",
			unreadLabel: "No unread updates",
			activeSessionLabel: "No active session",
			primarySessionLabel: "No primary session",
			updatedLabel: "Not updated",
			description: "Workspace details will appear here after selection.",
		};
	}

	return {
		title: workspace.title,
		subtitle: workspaceSubtitle(workspace),
		statusLabel: STATUS_LABELS[workspace.status],
		stateLabel: STATE_LABELS[workspace.state],
		modeLabel: MODE_LABELS[workspace.mode],
		sessionCountLabel: formatCount(workspace.sessionCount, "session"),
		messageCountLabel: formatCount(workspace.messageCount, "message"),
		unreadLabel:
			workspace.unreadSessionCount > 0
				? `${workspace.unreadSessionCount} unread ${pluralize(
						workspace.unreadSessionCount,
						"session",
					)}`
				: "No unread updates",
		activeSessionLabel: workspace.activeSessionTitle || "No active session",
		primarySessionLabel: workspace.primarySessionTitle || "No primary session",
		updatedLabel: formatUpdatedAt(workspace.updatedAt),
		description: workspace.summary,
	};
}

export function workspaceSubtitle(workspace: MobileWorkspaceRow): string {
	if (workspace.mode === "chat") return "Chat workspace";
	if (workspace.repoName && workspace.branch) {
		return `${workspace.repoName} / ${workspace.branch}`;
	}
	return workspace.repoName ?? workspace.directoryName;
}

export function workspaceStatusLabel(
	status: MobileWorkspaceRow["status"],
): string {
	return STATUS_LABELS[status];
}

function formatCount(value: number, noun: string): string {
	return `${value} ${pluralize(value, noun)}`;
}

function pluralize(value: number, noun: string): string {
	return value === 1 ? noun : `${noun}s`;
}

function formatUpdatedAt(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return "Updated recently";
	return `Updated ${new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date)}`;
}
