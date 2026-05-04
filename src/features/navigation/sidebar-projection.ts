import type { WorkspaceGroup, WorkspaceRow, WorkspaceSummary } from "@/lib/api";
import { summaryToArchivedRow } from "@/lib/workspace-helpers";

export type PendingArchiveEntry = {
	row: WorkspaceRow;
	sourceGroupId: string;
	sourceIndex: number;
	stage: "preparing" | "running" | "confirmed";
	sortTimestamp: number;
};

export type PendingCreationEntry = {
	repoId: string;
	row: WorkspaceRow;
	stage: "creating" | "confirmed";
	resolvedWorkspaceId: string | null;
};

type ProjectedArchivedRow = {
	row: WorkspaceRow;
	sortTimestamp: number;
};

export function projectSidebarLists({
	baseGroups,
	baseArchivedSummaries,
	pendingArchives,
	pendingCreations,
}: {
	baseGroups: WorkspaceGroup[];
	baseArchivedSummaries: WorkspaceSummary[];
	pendingArchives: ReadonlyMap<string, PendingArchiveEntry>;
	pendingCreations: ReadonlyMap<string, PendingCreationEntry>;
}): {
	groups: WorkspaceGroup[];
	archivedRows: WorkspaceRow[];
} {
	const hiddenLiveIds = new Set(pendingArchives.keys());
	for (const [optimisticWorkspaceId, pendingCreation] of pendingCreations) {
		hiddenLiveIds.add(optimisticWorkspaceId);
		if (pendingCreation.resolvedWorkspaceId) {
			hiddenLiveIds.add(pendingCreation.resolvedWorkspaceId);
		}
	}
	const groups =
		hiddenLiveIds.size === 0
			? baseGroups
			: baseGroups.map((group) => ({
					...group,
					rows: group.rows.filter((row) => !hiddenLiveIds.has(row.id)),
				}));

	const liveGroups = Array.from(pendingCreations.values()).reduce(
		(currentGroups, pendingCreation) =>
			insertPendingCreationRow(currentGroups, pendingCreation.row),
		groups,
	);

	const archivedById = new Map<string, ProjectedArchivedRow>();
	for (let index = 0; index < baseArchivedSummaries.length; index += 1) {
		const summary = baseArchivedSummaries[index];
		const pending = pendingArchives.get(summary.id);
		archivedById.set(summary.id, {
			row: summaryToArchivedRow(summary),
			// While a pending entry exists, inherit its sortTimestamp so the
			// item doesn't jump when server data arrives. Once the pending
			// entry is reconciled away, fall back to stable server ordering.
			sortTimestamp: pending ? pending.sortTimestamp : -index,
		});
	}

	for (const [workspaceId, pendingArchive] of pendingArchives) {
		if (archivedById.has(workspaceId)) {
			continue;
		}

		archivedById.set(workspaceId, {
			row: {
				...pendingArchive.row,
				state: "archived",
			},
			sortTimestamp: pendingArchive.sortTimestamp,
		});
	}

	const archivedRows = Array.from(archivedById.values())
		.sort((left, right) => right.sortTimestamp - left.sortTimestamp)
		.map((entry) => entry.row);

	return {
		groups: liveGroups,
		archivedRows,
	};
}

export function shouldReconcilePendingArchive(
	workspaceId: string,
	baseGroups: WorkspaceGroup[],
	baseArchivedSummaries: WorkspaceSummary[],
): boolean {
	const stillLive = baseGroups.some((group) =>
		group.rows.some((row) => row.id === workspaceId),
	);
	if (stillLive) {
		return false;
	}

	return baseArchivedSummaries.some((summary) => summary.id === workspaceId);
}

export function shouldReconcilePendingCreation(
	pendingCreation: PendingCreationEntry,
	baseGroups: WorkspaceGroup[],
): boolean {
	const resolvedWorkspaceId = pendingCreation.resolvedWorkspaceId;
	if (pendingCreation.stage !== "confirmed" || !resolvedWorkspaceId) {
		return false;
	}

	return baseGroups.some((group) =>
		group.rows.some((row) => row.id === resolvedWorkspaceId),
	);
}

export function reorderWorkspaceRowsWithinGroup({
	groups,
	workspaceId,
	beforeWorkspaceId,
	afterWorkspaceId,
}: {
	groups: WorkspaceGroup[];
	workspaceId: string;
	beforeWorkspaceId?: string | null;
	afterWorkspaceId?: string | null;
}): WorkspaceGroup[] {
	const sourceGroup = groups.find((group) =>
		group.rows.some((row) => row.id === workspaceId),
	);
	if (!sourceGroup) {
		return groups;
	}

	const beforeGroup = beforeWorkspaceId
		? groups.find((group) =>
				group.rows.some((row) => row.id === beforeWorkspaceId),
			)
		: null;
	const afterGroup = afterWorkspaceId
		? groups.find((group) =>
				group.rows.some((row) => row.id === afterWorkspaceId),
			)
		: null;

	if (
		(beforeWorkspaceId && beforeGroup?.id !== sourceGroup.id) ||
		(afterWorkspaceId && afterGroup?.id !== sourceGroup.id)
	) {
		return groups;
	}

	const movingRow = sourceGroup.rows.find((row) => row.id === workspaceId);
	if (!movingRow) {
		return groups;
	}

	const rowsWithoutMoving = sourceGroup.rows.filter(
		(row) => row.id !== workspaceId,
	);
	const insertIndex = beforeWorkspaceId
		? rowsWithoutMoving.findIndex((row) => row.id === beforeWorkspaceId)
		: afterWorkspaceId
			? rowsWithoutMoving.findIndex((row) => row.id === afterWorkspaceId) + 1
			: rowsWithoutMoving.length;

	if (insertIndex < 0) {
		return groups;
	}

	const nextRows = [
		...rowsWithoutMoving.slice(0, insertIndex),
		movingRow,
		...rowsWithoutMoving.slice(insertIndex),
	];
	if (nextRows.every((row, index) => row.id === sourceGroup.rows[index]?.id)) {
		return groups;
	}

	return groups.map((group) =>
		group.id === sourceGroup.id ? { ...group, rows: nextRows } : group,
	);
}

function insertPendingCreationRow(
	groups: WorkspaceGroup[],
	row: WorkspaceRow,
): WorkspaceGroup[] {
	return groups.map((group) =>
		group.id === "progress"
			? {
					...group,
					rows: group.rows.some((item) => item.id === row.id)
						? group.rows
						: [row, ...group.rows],
				}
			: group,
	);
}
