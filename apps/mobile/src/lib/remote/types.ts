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
