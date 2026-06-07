import type { MobileWorkspaceGroup } from "@/features/workspaces/types";
import type {
	MobileRepositoryOption,
	WorkspaceSendTarget,
	WorkspaceSnapshot,
} from "@/lib/remote/types";
import { getCacheDb } from "./db";
import { nowIso, safeJsonParse } from "./json";

export type CachedWorkspaceSnapshot = {
	groups: MobileWorkspaceGroup[];
	repositories: MobileRepositoryOption[];
	syncedAt?: string | null;
	cachedAt: string;
};

export type CachedWorkspaceSelection = {
	selectedWorkspaceId: string | null;
	selectedSessionIdsByWorkspace: Record<string, string>;
	lastNewWorkspaceTarget?: WorkspaceSendTarget | null;
};

type SnapshotRow = {
	groups_json: string;
	repositories_json: string;
	synced_at: string | null;
	cached_at: string;
};

type SelectionRow = {
	selected_workspace_id: string | null;
	selected_session_ids_json: string;
	last_new_workspace_target_json: string | null;
};

export async function loadCachedWorkspaceSnapshot(
	desktopId: string,
): Promise<CachedWorkspaceSnapshot | null> {
	const db = await getCacheDb();
	const row = await db.getFirstAsync<SnapshotRow>(
		`SELECT groups_json, repositories_json, synced_at, cached_at
		 FROM desktop_snapshots
		 WHERE desktop_id = ?`,
		desktopId,
	);
	if (!row) return null;
	const groups = safeJsonParse<MobileWorkspaceGroup[]>(row.groups_json);
	const repositories = safeJsonParse<MobileRepositoryOption[]>(
		row.repositories_json,
	);
	if (!Array.isArray(groups) || !Array.isArray(repositories)) return null;
	return {
		groups,
		repositories,
		syncedAt: row.synced_at,
		cachedAt: row.cached_at,
	};
}

export async function writeCachedWorkspaceSnapshot({
	desktopId,
	snapshot,
	repositories,
}: {
	desktopId: string;
	snapshot: WorkspaceSnapshot;
	repositories: MobileRepositoryOption[];
}): Promise<void> {
	const db = await getCacheDb();
	await db.runAsync(
		`INSERT OR REPLACE INTO desktop_snapshots
		 (desktop_id, groups_json, repositories_json, synced_at, cached_at)
		 VALUES (?, ?, ?, ?, ?)`,
		desktopId,
		JSON.stringify(snapshot.groups),
		JSON.stringify(repositories),
		snapshot.syncedAt,
		nowIso(),
	);
}

export async function loadCachedWorkspaceSelection(
	desktopId: string,
): Promise<CachedWorkspaceSelection | null> {
	const db = await getCacheDb();
	const row = await db.getFirstAsync<SelectionRow>(
		`SELECT selected_workspace_id, selected_session_ids_json, last_new_workspace_target_json
		 FROM workspace_selection
		 WHERE desktop_id = ?`,
		desktopId,
	);
	if (!row) return null;
	const selectedSessionIdsByWorkspace =
		safeJsonParse<Record<string, string>>(row.selected_session_ids_json) ?? {};
	const lastNewWorkspaceTarget = parseWorkspaceSendTarget(
		safeJsonParse<unknown>(row.last_new_workspace_target_json),
	);
	return {
		selectedWorkspaceId: row.selected_workspace_id,
		selectedSessionIdsByWorkspace,
		lastNewWorkspaceTarget,
	};
}

export async function writeCachedWorkspaceSelection({
	desktopId,
	selectedWorkspaceId,
	selectedSessionIdsByWorkspace,
	lastNewWorkspaceTarget,
}: {
	desktopId: string;
	selectedWorkspaceId: string | null;
	selectedSessionIdsByWorkspace: Record<string, string>;
	lastNewWorkspaceTarget?: WorkspaceSendTarget | null;
}): Promise<void> {
	const db = await getCacheDb();
	const hasLastNewWorkspaceTarget = lastNewWorkspaceTarget !== undefined;
	await db.runAsync(
		`INSERT INTO workspace_selection
		 (desktop_id, selected_workspace_id, selected_session_ids_json, last_new_workspace_target_json, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(desktop_id) DO UPDATE SET
			selected_workspace_id = excluded.selected_workspace_id,
			selected_session_ids_json = excluded.selected_session_ids_json,
			last_new_workspace_target_json = CASE
				WHEN ? THEN excluded.last_new_workspace_target_json
				ELSE workspace_selection.last_new_workspace_target_json
			END,
			updated_at = excluded.updated_at`,
		desktopId,
		selectedWorkspaceId,
		JSON.stringify(selectedSessionIdsByWorkspace),
		hasLastNewWorkspaceTarget ? JSON.stringify(lastNewWorkspaceTarget) : null,
		nowIso(),
		hasLastNewWorkspaceTarget ? 1 : 0,
	);
}

function parseWorkspaceSendTarget(value: unknown): WorkspaceSendTarget | null {
	if (!value || typeof value !== "object") return null;
	const target = value as Partial<WorkspaceSendTarget>;
	if (target.kind === "chat") return { kind: "chat" };
	if (
		target.kind === "repo" &&
		typeof target.repoId === "string" &&
		(target.mode === "worktree" || target.mode === "local")
	) {
		return { kind: "repo", repoId: target.repoId, mode: target.mode };
	}
	return null;
}
