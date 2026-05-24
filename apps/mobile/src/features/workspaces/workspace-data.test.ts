import { describe, expect, test } from "bun:test";
import { MOCK_WORKSPACE_GROUPS } from "./mock-workspaces";
import {
	getDefaultWorkspaceId,
	getVisibleWorkspaceGroups,
	getWorkspaceById,
	getWorkspaceSummary,
} from "./workspace-selectors";

describe("mobile workspace mock data", () => {
	test("keeps desktop sidebar bucket order while hiding empty groups", () => {
		const visibleGroups = getVisibleWorkspaceGroups(MOCK_WORKSPACE_GROUPS);

		expect(visibleGroups.map((group) => group.id)).toEqual([
			"pinned",
			"chats",
			"done",
			"review",
			"progress",
			"backlog",
			"canceled",
		]);
		expect(visibleGroups.every((group) => group.rows.length > 0)).toBe(true);
	});

	test("uses the first visible workspace as the default selection", () => {
		expect(getDefaultWorkspaceId(MOCK_WORKSPACE_GROUPS)).toBe(
			"ws-mobile-shell",
		);
	});

	test("finds workspaces across all groups and derives summary labels", () => {
		const workspace = getWorkspaceById(
			MOCK_WORKSPACE_GROUPS,
			"ws-agent-streaming",
		);

		expect(workspace?.repoName).toBe("helmor");
		expect(workspace?.branch).toBe("agent-streaming-ui");
		expect(getWorkspaceSummary(workspace).subtitle).toBe(
			"helmor / agent-streaming-ui",
		);
		expect(getWorkspaceSummary(workspace).statusLabel).toBe("In review");
	});
});
