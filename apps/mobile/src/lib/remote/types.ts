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

export type AgentProvider = "claude" | "codex" | "cursor";

export type AgentModelOption = {
	id: string;
	provider: AgentProvider;
	label: string;
	cliModel: string;
	providerKey?: string | null;
	effortLevels: string[];
	supportsFastMode?: boolean;
	supportsContextUsage: boolean;
};

export type AgentModelSectionStatus = "ready" | "unavailable" | "error";

export type AgentModelSection = {
	id: string;
	label: string;
	status: AgentModelSectionStatus;
	options: AgentModelOption[];
};

export type PermissionModeLiteral =
	| "default"
	| "acceptEdits"
	| "plan"
	| "bypassPermissions";

export type ProviderCapabilities = {
	provider: string;
	displayName: string;
	supportsPlanMode: boolean;
	supportsActiveGoal: boolean;
	supportsContextUsage: boolean;
	supportsSteer: boolean;
	supportsSlashCommands: boolean;
	requiresApiKey: boolean;
	permissionModes: PermissionModeLiteral[];
};

export type AgentConfig = {
	modelSections: AgentModelSection[];
	providerCapabilities: ProviderCapabilities[];
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
	currentBranch?: string | null;
	branches?: MobileBranchOption[];
};

export type MobileBranchOption = {
	name: string;
	hasLocal: boolean;
	hasRemote: boolean;
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
	| {
			kind: "repo";
			repoId: string;
			mode: "worktree" | "local";
			sourceBranch?: string | null;
			branchIntent?: "from_branch" | "use_branch" | null;
	  };

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
	| { type: "workspaceFilesChanged"; workspaceId: string }
	| { type: "workspaceGitStateChanged"; workspaceId: string }
	| { type: "workspaceForgeChanged"; workspaceId: string }
	| { type: "workspaceChangeRequestChanged"; workspaceId: string }
	| { type: "activeStreamsChanged" }
	| { type: "repositoryListChanged" }
	| { type: "repositoryChanged"; repoId: string }
	| { type: "repoRunActionsChanged"; repoId: string }
	| { type: "settingsChanged"; key?: string | null }
	| { type: "pairedDevicesChanged" }
	| {
			type: "pendingCliSendQueued";
			workspaceId: string;
			sessionId: string;
			prompt: string;
			modelId: string | null;
			permissionMode: string | null;
	  }
	| { type: "slackWorkspacesChanged" }
	| { type: "slackTokenInvalidated"; teamId: string }
	| { type: "triageConfigChanged" }
	| { type: "triageActiveStatusChanged" }
	| { type: "triageWorkspaceCreated"; workspaceId: string }
	| { type: "fastModeUnavailable"; sessionId: string; reason: string }
	| { type: string; [key: string]: unknown };

export type UiMutationEnvelope = {
	version: number;
	event: UiMutationEvent;
};
