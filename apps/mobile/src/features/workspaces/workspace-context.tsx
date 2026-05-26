import type React from "react";
import {
	createContext,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	type BacklogCreateRequest,
	createPairedDesktopClient,
	type DesktopConnection,
	type DesktopConnectionState,
	getActiveDesktopConnection,
	loadDesktopConnectionState,
	prioritizeHosts,
	removeDesktopConnection,
	setActiveDesktopConnection,
	upsertDesktopConnection,
} from "@/lib/remote";
import type {
	MobileWorkspaceGroup,
	MobileWorkspaceRow,
	MobileWorkspaceSessionTab,
	MobileWorkspaceSummary,
} from "./types";
import {
	getDefaultWorkspaceId,
	getVisibleWorkspaceGroups,
	getWorkspaceById,
	getWorkspaceSessionTabs,
	getWorkspaceSummary,
} from "./workspace-selectors";

type WorkspaceContextValue = {
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
	sessionTabs: MobileWorkspaceSessionTab[];
	selectedWorkspaceSessionId: string | null;
	selectedWorkspaceSessionTab: MobileWorkspaceSessionTab | null;
	selectWorkspace: (workspaceId: string) => void;
	startNewWorkspace: () => void;
	selectWorkspaceSession: (sessionId: string) => void;
	refreshWorkspaces: () => Promise<void>;
	createBacklogTask: (request: BacklogCreateRequest) => Promise<void>;
	reloadDesktopConnections: () => Promise<void>;
	setActiveDesktop: (desktopId: string) => Promise<void>;
	removeDesktop: (desktopId: string) => Promise<void>;
};

const EMPTY_DESKTOP_STATE: DesktopConnectionState = {
	activeDesktopId: null,
	connections: [],
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
	children,
	initialGroups = [],
}: {
	children: React.ReactNode;
	initialGroups?: MobileWorkspaceGroup[];
}) {
	const [groups, setGroups] = useState(initialGroups);
	const [desktopState, setDesktopState] =
		useState<DesktopConnectionState>(EMPTY_DESKTOP_STATE);
	const [syncStatus, setSyncStatus] =
		useState<WorkspaceContextValue["syncStatus"]>("idle");
	const [syncError, setSyncError] = useState<string | null>(null);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
		() => getDefaultWorkspaceId(groups),
	);
	const [newWorkspaceDraftKey, setNewWorkspaceDraftKey] = useState<
		string | null
	>(null);
	const [selectedSessionIdsByWorkspace, setSelectedSessionIdsByWorkspace] =
		useState<Record<string, string>>({});
	const activeDesktop = useMemo(
		() => getActiveDesktopConnection(desktopState),
		[desktopState],
	);
	const activeDesktopId = activeDesktop?.desktopId ?? null;

	const visibleGroups = useMemo(
		() => getVisibleWorkspaceGroups(groups),
		[groups],
	);
	const isNewWorkspaceDraft = newWorkspaceDraftKey !== null;
	const selectedWorkspace = isNewWorkspaceDraft
		? null
		: (getWorkspaceById(groups, selectedWorkspaceId) ??
			getWorkspaceById(groups, getDefaultWorkspaceId(groups)));
	const selectedWorkspaceSummary = useMemo(
		() => getWorkspaceSummary(selectedWorkspace),
		[selectedWorkspace],
	);
	const sessionTabs = useMemo(
		() => getWorkspaceSessionTabs(selectedWorkspace),
		[selectedWorkspace],
	);
	const selectedWorkspaceSessionTab =
		sessionTabs.find(
			(tab) =>
				tab.id ===
				(selectedWorkspace
					? selectedSessionIdsByWorkspace[selectedWorkspace.id]
					: null),
		) ??
		sessionTabs[0] ??
		null;
	const selectedWorkspaceSessionId = selectedWorkspaceSessionTab?.id ?? null;

	const reloadDesktopConnections = useCallback(async () => {
		const nextState = await loadDesktopConnectionState();
		setDesktopState(nextState);
		if (!getActiveDesktopConnection(nextState)) {
			setGroups([]);
			setSelectedWorkspaceId(null);
			setNewWorkspaceDraftKey(null);
			setSyncStatus("idle");
			setSyncError(null);
		}
	}, []);

	useEffect(() => {
		void reloadDesktopConnections();
	}, [reloadDesktopConnections]);

	useEffect(() => {
		if (isNewWorkspaceDraft) return;
		if (getWorkspaceById(groups, selectedWorkspaceId)) return;
		setSelectedWorkspaceId(getDefaultWorkspaceId(groups));
	}, [groups, isNewWorkspaceDraft, selectedWorkspaceId]);

	const refreshWorkspaces = useCallback(async () => {
		if (!activeDesktop) return;
		setSyncStatus("syncing");
		setSyncError(null);
		let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
			null;
		try {
			client = await createPairedDesktopClient(activeDesktop);
			const snapshot = await client.workspaceSnapshot();
			setGroups(snapshot.groups);
			setDesktopState(
				await upsertDesktopConnection({
					...activeDesktop,
					hosts: prioritizeHosts(activeDesktop.hosts, client.connectedHost),
					lastSyncedAt: snapshot.syncedAt,
				}),
			);
			setSyncStatus("idle");
		} catch (error) {
			setSyncStatus("error");
			setSyncError(errorMessage(error));
		} finally {
			client?.close();
		}
	}, [activeDesktop]);

	const createBacklogTask = useCallback(
		async (request: BacklogCreateRequest) => {
			if (!activeDesktop) {
				throw new Error("Connect a desktop first");
			}
			const client = await createPairedDesktopClient(activeDesktop);
			try {
				await client.createBacklogTask(request);
				await refreshWorkspaces();
			} finally {
				client.close();
			}
		},
		[activeDesktop, refreshWorkspaces],
	);

	useEffect(() => {
		if (!activeDesktop) {
			setGroups([]);
			setSelectedWorkspaceId(null);
			setNewWorkspaceDraftKey(null);
			setSyncStatus("idle");
			setSyncError(null);
			return;
		}
		void refreshWorkspaces();
	}, [activeDesktopId]);

	const setActiveDesktop = useCallback(async (desktopId: string) => {
		setDesktopState(await setActiveDesktopConnection(desktopId));
	}, []);

	const removeDesktop = useCallback(async (desktopId: string) => {
		setDesktopState(await removeDesktopConnection(desktopId));
	}, []);

	const selectWorkspace = useCallback(
		(workspaceId: string) => {
			if (getWorkspaceById(groups, workspaceId)) {
				setNewWorkspaceDraftKey(null);
				setSelectedWorkspaceId(workspaceId);
			}
		},
		[groups],
	);

	const startNewWorkspace = useCallback(() => {
		setSelectedWorkspaceId(null);
		setNewWorkspaceDraftKey(`new-workspace:${Date.now()}`);
	}, []);

	const selectWorkspaceSession = useCallback(
		(sessionId: string) => {
			if (!selectedWorkspace) return;
			if (!sessionTabs.some((tab) => tab.id === sessionId)) return;
			setSelectedSessionIdsByWorkspace((previous) => ({
				...previous,
				[selectedWorkspace.id]: sessionId,
			}));
		},
		[selectedWorkspace, sessionTabs],
	);

	const value = useMemo(
		() => ({
			groups,
			visibleGroups,
			desktopState,
			activeDesktop,
			syncStatus,
			syncError,
			selectedWorkspaceId: selectedWorkspace?.id ?? selectedWorkspaceId,
			selectedWorkspace,
			selectedWorkspaceSummary,
			isNewWorkspaceDraft,
			newWorkspaceDraftKey,
			sessionTabs,
			selectedWorkspaceSessionId,
			selectedWorkspaceSessionTab,
			selectWorkspace,
			startNewWorkspace,
			selectWorkspaceSession,
			refreshWorkspaces,
			createBacklogTask,
			reloadDesktopConnections,
			setActiveDesktop,
			removeDesktop,
		}),
		[
			groups,
			visibleGroups,
			desktopState,
			activeDesktop,
			syncStatus,
			syncError,
			selectedWorkspaceId,
			selectedWorkspace,
			selectedWorkspaceSummary,
			isNewWorkspaceDraft,
			newWorkspaceDraftKey,
			sessionTabs,
			selectedWorkspaceSessionId,
			selectedWorkspaceSessionTab,
			selectWorkspace,
			startNewWorkspace,
			selectWorkspaceSession,
			refreshWorkspaces,
			createBacklogTask,
			reloadDesktopConnections,
			setActiveDesktop,
			removeDesktop,
		],
	);

	return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function useWorkspaces() {
	const context = use(WorkspaceContext);
	if (!context) {
		throw new Error("useWorkspaces must be used within a WorkspaceProvider");
	}
	return context;
}
