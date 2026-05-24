import type React from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";
import { MOCK_WORKSPACE_GROUPS } from "./mock-workspaces";
import type {
	MobileWorkspaceGroup,
	MobileWorkspaceRow,
	MobileWorkspaceSummary,
} from "./types";
import {
	getDefaultWorkspaceId,
	getVisibleWorkspaceGroups,
	getWorkspaceById,
	getWorkspaceSummary,
} from "./workspace-selectors";

type WorkspaceContextValue = {
	groups: MobileWorkspaceGroup[];
	visibleGroups: MobileWorkspaceGroup[];
	selectedWorkspaceId: string | null;
	selectedWorkspace: MobileWorkspaceRow | null;
	selectedWorkspaceSummary: MobileWorkspaceSummary;
	selectWorkspace: (workspaceId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
	children,
	initialGroups = MOCK_WORKSPACE_GROUPS,
}: {
	children: React.ReactNode;
	initialGroups?: MobileWorkspaceGroup[];
}) {
	const groups = initialGroups;
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
		() => getDefaultWorkspaceId(groups),
	);

	const visibleGroups = useMemo(
		() => getVisibleWorkspaceGroups(groups),
		[groups],
	);
	const selectedWorkspace =
		getWorkspaceById(groups, selectedWorkspaceId) ??
		getWorkspaceById(groups, getDefaultWorkspaceId(groups));
	const selectedWorkspaceSummary = useMemo(
		() => getWorkspaceSummary(selectedWorkspace),
		[selectedWorkspace],
	);

	const selectWorkspace = useCallback(
		(workspaceId: string) => {
			if (getWorkspaceById(groups, workspaceId)) {
				setSelectedWorkspaceId(workspaceId);
			}
		},
		[groups],
	);

	const value = useMemo(
		() => ({
			groups,
			visibleGroups,
			selectedWorkspaceId: selectedWorkspace?.id ?? selectedWorkspaceId,
			selectedWorkspace,
			selectedWorkspaceSummary,
			selectWorkspace,
		}),
		[
			groups,
			visibleGroups,
			selectedWorkspaceId,
			selectedWorkspace,
			selectedWorkspaceSummary,
			selectWorkspace,
		],
	);

	return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspaces() {
	const context = use(WorkspaceContext);
	if (!context) {
		throw new Error("useWorkspaces must be used within a WorkspaceProvider");
	}
	return context;
}
