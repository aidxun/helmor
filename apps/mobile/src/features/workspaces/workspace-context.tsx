import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	loadCachedWorkspaceSelection,
	loadCachedWorkspaceSnapshot,
	writeCachedWorkspaceSelection,
	writeCachedWorkspaceSnapshot,
} from "@/lib/local-cache";
import {
	type BacklogCreateRequest,
	createPairedDesktopClient,
	type DesktopConnectionState,
	getActiveDesktopConnection,
	loadDesktopConnectionState,
	type MobileRepositoryOption,
	removeDesktopConnection,
	setActiveDesktopConnection,
	type UiMutationEvent,
	upsertDesktopConnection,
	type WorkspaceSendTarget,
} from "@/lib/remote";
import type { MobileWorkspaceGroup } from "./types";
import { useRemoteMutationStream } from "./use-remote-mutation-stream";
import {
	EMPTY_DESKTOP_STATE,
	useWorkspaces,
	WorkspaceContext,
	type WorkspaceContextValue,
} from "./workspace-context-core";
import { handleWorkspaceRemoteMutation } from "./workspace-remote-mutations";
import {
	getDefaultWorkspaceId,
	getVisibleWorkspaceGroups,
	getWorkspaceById,
	getWorkspaceSessionTabs,
	getWorkspaceSummary,
} from "./workspace-selectors";

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
	const [newWorkspaceTarget, setNewWorkspaceTarget] =
		useState<WorkspaceSendTarget>({ kind: "chat" });
	const [repositories, setRepositories] = useState<MobileRepositoryOption[]>(
		[],
	);
	const [threadRefreshVersion, setThreadRefreshVersion] = useState(0);
	const [selectedSessionIdsByWorkspace, setSelectedSessionIdsByWorkspace] =
		useState<Record<string, string>>({});
	const refreshRequestId = useRef(0);
	const workspaceRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
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
			setRepositories([]);
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
		if (workspaceRefreshTimer.current) {
			clearTimeout(workspaceRefreshTimer.current);
			workspaceRefreshTimer.current = null;
		}
		const requestId = refreshRequestId.current + 1;
		refreshRequestId.current = requestId;
		setSyncStatus("syncing");
		setSyncError(null);
		let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
			null;
		try {
			client = await createPairedDesktopClient(activeDesktop);
			const snapshot = await client.workspaceSnapshot();
			const repoOptions = await client.listRepositories();
			if (requestId !== refreshRequestId.current) return;
			setGroups(snapshot.groups);
			setRepositories(repoOptions);
			void writeCachedWorkspaceSnapshot({
				desktopId: activeDesktop.desktopId,
				snapshot,
				repositories: repoOptions,
			}).catch(() => {});
			setDesktopState(
				await upsertDesktopConnection({
					...activeDesktop,
					host: client.connectedHost,
					lastSyncedAt: snapshot.syncedAt,
				}),
			);
			setSyncStatus("idle");
		} catch (error) {
			if (requestId !== refreshRequestId.current) return;
			setSyncStatus("error");
			setSyncError(errorMessage(error));
		} finally {
			client?.close();
		}
	}, [activeDesktop]);

	const refreshWorkspacesSoon = useCallback(() => {
		if (workspaceRefreshTimer.current) {
			clearTimeout(workspaceRefreshTimer.current);
		}
		workspaceRefreshTimer.current = setTimeout(() => {
			workspaceRefreshTimer.current = null;
			void refreshWorkspaces();
		}, 900);
	}, [refreshWorkspaces]);

	const handleRemoteMutation = useCallback(
		(event: UiMutationEvent) =>
			handleWorkspaceRemoteMutation(
				event,
				refreshWorkspaces,
				refreshWorkspacesSoon,
				() => {
					setThreadRefreshVersion((version) => version + 1);
				},
			),
		[refreshWorkspaces, refreshWorkspacesSoon],
	);

	useEffect(() => {
		return () => {
			if (workspaceRefreshTimer.current) {
				clearTimeout(workspaceRefreshTimer.current);
			}
		};
	}, []);

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
			if (workspaceRefreshTimer.current) {
				clearTimeout(workspaceRefreshTimer.current);
				workspaceRefreshTimer.current = null;
			}
			setGroups([]);
			setRepositories([]);
			setSelectedWorkspaceId(null);
			setNewWorkspaceDraftKey(null);
			setSyncStatus("idle");
			setSyncError(null);
			return;
		}

		let canceled = false;
		void (async () => {
			try {
				const [snapshot, selection] = await Promise.all([
					loadCachedWorkspaceSnapshot(activeDesktop.desktopId),
					loadCachedWorkspaceSelection(activeDesktop.desktopId),
				]);
				if (canceled) return;
				if (snapshot) {
					setGroups(snapshot.groups);
					setRepositories(snapshot.repositories);
				}
				if (selection) {
					setSelectedWorkspaceId(selection.selectedWorkspaceId);
					setSelectedSessionIdsByWorkspace(
						selection.selectedSessionIdsByWorkspace,
					);
				}
			} catch {
				// Cache failures should not block a fresh desktop sync.
			}
			if (!canceled) void refreshWorkspaces();
		})();

		return () => {
			canceled = true;
		};
	}, [activeDesktopId]);

	useRemoteMutationStream({
		activeDesktop,
		onMutation: handleRemoteMutation,
	});

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
				if (activeDesktopId) {
					void writeCachedWorkspaceSelection({
						desktopId: activeDesktopId,
						selectedWorkspaceId: workspaceId,
						selectedSessionIdsByWorkspace,
					}).catch(() => {});
				}
			}
		},
		[activeDesktopId, groups, selectedSessionIdsByWorkspace],
	);

	const startNewWorkspace = useCallback(() => {
		setSelectedWorkspaceId(null);
		setNewWorkspaceDraftKey(`new-workspace:${Date.now()}`);
		setNewWorkspaceTarget({ kind: "chat" });
	}, []);

	const selectCreatedWorkspace = useCallback(
		(workspaceId: string, sessionId: string) => {
			setNewWorkspaceDraftKey(null);
			setSelectedWorkspaceId(workspaceId);
			setSelectedSessionIdsByWorkspace((previous) => {
				const next = {
					...previous,
					[workspaceId]: sessionId,
				};
				if (activeDesktopId) {
					void writeCachedWorkspaceSelection({
						desktopId: activeDesktopId,
						selectedWorkspaceId: workspaceId,
						selectedSessionIdsByWorkspace: next,
					}).catch(() => {});
				}
				return next;
			});
		},
		[activeDesktopId],
	);

	const selectWorkspaceSession = useCallback(
		(sessionId: string) => {
			if (!selectedWorkspace) return;
			if (!sessionTabs.some((tab) => tab.id === sessionId)) return;
			setSelectedSessionIdsByWorkspace((previous) => {
				const next = {
					...previous,
					[selectedWorkspace.id]: sessionId,
				};
				if (activeDesktopId) {
					void writeCachedWorkspaceSelection({
						desktopId: activeDesktopId,
						selectedWorkspaceId: selectedWorkspace.id,
						selectedSessionIdsByWorkspace: next,
					}).catch(() => {});
				}
				return next;
			});
		},
		[activeDesktopId, selectedWorkspace, sessionTabs],
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
			newWorkspaceTarget,
			repositories,
			sessionTabs,
			selectedWorkspaceSessionId,
			selectedWorkspaceSessionTab,
			threadRefreshVersion,
			selectWorkspace,
			startNewWorkspace,
			setNewWorkspaceTarget,
			selectCreatedWorkspace,
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
			newWorkspaceTarget,
			repositories,
			sessionTabs,
			selectedWorkspaceSessionId,
			selectedWorkspaceSessionTab,
			threadRefreshVersion,
			selectWorkspace,
			startNewWorkspace,
			selectCreatedWorkspace,
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

export { useWorkspaces };
