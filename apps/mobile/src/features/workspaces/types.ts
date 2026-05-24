export type MobileWorkspaceState =
	| "initializing"
	| "setup_pending"
	| "ready"
	| "archived";

export type MobileWorkspaceMode = "worktree" | "local" | "chat";

export type MobileWorkspaceStatus =
	| "in-progress"
	| "done"
	| "review"
	| "backlog"
	| "canceled";

export type MobileWorkspaceGroupId =
	| "pinned"
	| "chats"
	| "done"
	| "review"
	| "progress"
	| "backlog"
	| "canceled";

export type MobileWorkspaceRow = {
	id: string;
	title: string;
	directoryName: string;
	repoId?: string;
	repoName?: string;
	repoInitials?: string;
	state: MobileWorkspaceState;
	mode: MobileWorkspaceMode;
	status: MobileWorkspaceStatus;
	branch?: string | null;
	activeSessionId?: string | null;
	activeSessionTitle?: string | null;
	activeSessionAgentType?: string | null;
	activeSessionStatus?: string | null;
	primarySessionId?: string | null;
	primarySessionTitle?: string | null;
	primarySessionAgentType?: string | null;
	pinnedAt?: string | null;
	sessionCount: number;
	messageCount: number;
	workspaceUnread: number;
	unreadSessionCount: number;
	hasUnread: boolean;
	updatedAt: string;
	summary: string;
};

export type MobileWorkspaceGroup = {
	id: MobileWorkspaceGroupId;
	label: string;
	tone: MobileWorkspaceGroupId;
	rows: MobileWorkspaceRow[];
};

export type MobileWorkspaceSummary = {
	title: string;
	subtitle: string;
	statusLabel: string;
	stateLabel: string;
	modeLabel: string;
	sessionCountLabel: string;
	messageCountLabel: string;
	unreadLabel: string;
	activeSessionLabel: string;
	primarySessionLabel: string;
	updatedLabel: string;
	description: string;
};
