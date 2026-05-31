import { createContext, use } from "react";
import type {
	BacklogCreateRequest,
	DesktopConnection,
	DesktopConnectionState,
	MobileRepositoryOption,
	WorkspaceSendTarget,
} from "@/lib/remote";
import type {
	MobileWorkspaceGroup,
	MobileWorkspaceRow,
	MobileWorkspaceSessionTab,
	MobileWorkspaceSummary,
} from "./types";

export type WorkspaceContextValue = {
	groups: MobileWorkspaceGroup[];
	visibleGroups: MobileWorkspaceGroup[];
	desktopState: DesktopConnectionState;
	activeDesktop: DesktopConnection | null;
	syncStatus: "idle" | "syncing" | "error";
	syncError: string | null;
	selectedWorkspaceId: string | null;
	selectedWorkspace: MobileWorkspaceRow | null;
	selectedWorkspaceSummary: MobileWorkspaceSummary;
	isNewWorkspaceDraft: boolean;
	newWorkspaceDraftKey: string | null;
	newWorkspaceTarget: WorkspaceSendTarget;
	repositories: MobileRepositoryOption[];
	sessionTabs: MobileWorkspaceSessionTab[];
	selectedWorkspaceSessionId: string | null;
	selectedWorkspaceSessionTab: MobileWorkspaceSessionTab | null;
	threadRefreshVersion: number;
	selectWorkspace: (workspaceId: string) => void;
	startNewWorkspace: () => void;
	setNewWorkspaceTarget: (target: WorkspaceSendTarget) => void;
	selectCreatedWorkspace: (workspaceId: string, sessionId: string) => void;
	selectWorkspaceSession: (sessionId: string) => void;
	refreshWorkspaces: () => Promise<void>;
	createBacklogTask: (request: BacklogCreateRequest) => Promise<void>;
	reloadDesktopConnections: () => Promise<void>;
	setActiveDesktop: (desktopId: string) => Promise<void>;
	removeDesktop: (desktopId: string) => Promise<void>;
};

export const EMPTY_DESKTOP_STATE: DesktopConnectionState = {
	activeDesktopId: null,
	connections: [],
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
	null,
);

export function useWorkspaces() {
	const context = use(WorkspaceContext);
	if (!context) {
		throw new Error("useWorkspaces must be used within a WorkspaceProvider");
	}
	return context;
}
