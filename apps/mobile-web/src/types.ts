import type { ThreadMessageLike } from "@helmor/thread-schema";

export type DesktopConnection = {
	host: string;
	pat: string;
	desktopId: string;
	desktopName: string;
};

export type CompactPairingPayload = {
	v: number;
	h: string;
	p: string;
	d: string;
	n: string;
	i?: string;
	s?: boolean;
};

export type WorkspaceSnapshot = {
	protocolVersion: number;
	desktopId: string;
	syncedAt: string;
	groups: MobileWorkspaceGroup[];
};

export type MobileWorkspaceGroup = {
	id: string;
	label: string;
	tone: string;
	rows: MobileWorkspaceRow[];
};

export type MobileWorkspaceRow = {
	id: string;
	title: string;
	directoryName: string;
	repoId?: string;
	repoName?: string;
	repoInitials?: string;
	state: string;
	mode: "chat" | "local" | "worktree";
	status: string;
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

export type WorkspaceSessionSummary = {
	id: string;
	workspaceId: string;
	title: string;
	agentType?: string | null;
	status: string;
	model?: string | null;
	permissionMode: string;
	providerSessionId?: string | null;
	effortLevel?: string | null;
	unreadCount: number;
	fastMode: boolean;
	createdAt: string;
	updatedAt: string;
	lastUserMessageAt?: string | null;
	isHidden: boolean;
	actionKind?: unknown;
	active: boolean;
};

export type SessionThreadMessagesPage = {
	messages: ThreadMessageLike[];
	hasMore: boolean;
};

export type AgentStreamEvent =
	| { kind: "update"; messages: ThreadMessageLike[] }
	| { kind: "streamingPartial"; message: ThreadMessageLike }
	| { kind: "done"; [key: string]: unknown }
	| { kind: "aborted"; reason: string; [key: string]: unknown }
	| { kind: "error"; message: string; [key: string]: unknown }
	| { kind: string; [key: string]: unknown };

export type CompanionStreamEvent =
	| {
			kind: "started";
			workspaceId: string;
			sessionId: string;
			mode: "chat" | "worktree" | "local";
			repoId?: string | null;
	  }
	| { kind: "agent"; event: AgentStreamEvent }
	| { kind: "error"; message: string };

export type UiMutationEvent =
	| { type: "workspaceListChanged" }
	| { type: "workspaceChanged"; workspaceId: string }
	| { type: "sessionListChanged"; workspaceId: string }
	| { type: "sessionMessagesAppended"; sessionId: string }
	| { type: "contextUsageChanged"; sessionId: string }
	| { type: "codexGoalChanged"; sessionId: string }
	| { type: "activeStreamsChanged" }
	| { type: string; [key: string]: unknown };

export type UiMutationEnvelope = {
	version: number;
	event: UiMutationEvent;
};
