import type { ThreadMessageLike } from "@helmor/thread-schema";
import type { MobileWorkspaceGroup } from "@/features/workspaces/types";

export type DesktopConnection = {
	desktopId: string;
	desktopName: string;
	host: string;
	pat: string;
	lastSyncedAt?: string | null;
};

export type DesktopConnectionState = {
	activeDesktopId: string | null;
	connections: DesktopConnection[];
};

export type MobilePairingPayload = {
	v: number;
	host: string;
	pat: string;
	desktopId: string;
	desktopName: string;
	deviceId?: string;
	stable?: boolean;
};

export type CompanionHealth = {
	ok: boolean;
	protocolVersion: number;
	desktopId: string;
	desktopName: string;
};

export type WorkspaceSnapshot = {
	protocolVersion: number;
	desktopId: string;
	syncedAt: string;
	groups: MobileWorkspaceGroup[];
};

export type MobileRepositoryOption = {
	id: string;
	name: string;
	remote?: string | null;
	remoteUrl?: string | null;
	defaultBranch?: string | null;
	repoIconSrc?: string | null;
	repoInitials?: string | null;
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

export type SessionThreadPageRequest = {
	sessionId: string;
	tailLimit?: number | null;
};

export type BacklogCreateRequest = {
	prompt: string;
	title?: string;
	repoId?: string | null;
	mode?: "chat" | "worktree" | "local";
};

export type BacklogCreateResult = {
	workspaceId: string;
	sessionId: string;
	status: "backlog";
};

export type AgentStreamEvent =
	| { kind: "update"; messages: ThreadMessageLike[] }
	| { kind: "streamingPartial"; message: ThreadMessageLike }
	| {
			kind: "done";
			provider: string;
			modelId: string;
			resolvedModel: string;
			sessionId?: string | null;
			workingDirectory: string;
			persisted: boolean;
	  }
	| {
			kind: "aborted";
			reason: string;
			provider: string;
			modelId: string;
			resolvedModel: string;
			sessionId?: string | null;
			workingDirectory: string;
			persisted: boolean;
	  }
	| { kind: "error"; message: string; persisted: boolean; internal: boolean }
	| { kind: string; [key: string]: unknown };

export type WorkspaceSendTarget =
	| { kind: "chat" }
	| { kind: "repo"; repoId: string; mode: "worktree" | "local" };

export type SendMessageStreamRequest = {
	prompt: string;
	modelId?: string | null;
	effortLevel?: string | null;
	permissionMode?: string | null;
	fastMode?: boolean | null;
};

export type SendNewWorkspaceStreamRequest = SendMessageStreamRequest & {
	target: WorkspaceSendTarget;
};

export type SendStreamStarted = {
	workspaceId: string;
	sessionId: string;
	mode: "chat" | "worktree" | "local";
	repoId?: string | null;
};

export type CompanionStreamEvent =
	| ({ kind: "started" } & SendStreamStarted)
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
	| { type: "repositoryListChanged" }
	| { type: "repositoryChanged"; repoId: string }
	| { type: "settingsChanged"; key?: string | null }
	| { type: string; [key: string]: unknown };

export type UiMutationEnvelope = {
	version: number;
	event: UiMutationEvent;
};
