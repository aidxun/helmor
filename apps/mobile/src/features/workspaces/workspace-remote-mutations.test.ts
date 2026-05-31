import { describe, expect, test } from "bun:test";
import type { UiMutationEvent } from "@/lib/remote";
import { handleWorkspaceRemoteMutation } from "./workspace-remote-mutations";

describe("mobile workspace remote mutations", () => {
	const workspaceOnlyEvents = [
		{ type: "workspaceListChanged" },
		{ type: "workspaceChanged", workspaceId: "workspace-1" },
		{ type: "sessionListChanged", workspaceId: "workspace-1" },
		{ type: "workspaceGitStateChanged", workspaceId: "workspace-1" },
		{ type: "workspaceForgeChanged", workspaceId: "workspace-1" },
		{ type: "workspaceChangeRequestChanged", workspaceId: "workspace-1" },
		{ type: "repositoryListChanged" },
		{ type: "repositoryChanged", repoId: "repo-1" },
		{ type: "settingsChanged", key: null },
		{ type: "triageWorkspaceCreated", workspaceId: "workspace-1" },
	] satisfies UiMutationEvent[];

	for (const event of workspaceOnlyEvents) {
		test(`refreshes workspace data for ${event.type}`, () => {
			let workspaceRefreshes = 0;
			let threadRefreshes = 0;

			handleWorkspaceRemoteMutation(
				event,
				async () => {
					workspaceRefreshes += 1;
				},
				() => {
					workspaceRefreshes += 1;
				},
				() => {
					threadRefreshes += 1;
				},
			);

			expect(workspaceRefreshes).toBe(1);
			expect(threadRefreshes).toBe(0);
		});
	}

	const workspaceAndThreadEvents = [
		{ type: "sessionMessagesAppended", sessionId: "session-1" },
		{ type: "contextUsageChanged", sessionId: "session-1" },
		{ type: "codexGoalChanged", sessionId: "session-1" },
		{ type: "activeStreamsChanged" },
	] satisfies UiMutationEvent[];

	for (const event of workspaceAndThreadEvents) {
		test(`refreshes workspace data and the selected thread for ${event.type}`, () => {
			let workspaceRefreshes = 0;
			let threadRefreshes = 0;

			handleWorkspaceRemoteMutation(
				event,
				async () => {
					workspaceRefreshes += 1;
				},
				() => {
					workspaceRefreshes += 1;
				},
				() => {
					threadRefreshes += 1;
				},
			);

			expect(workspaceRefreshes).toBe(1);
			expect(threadRefreshes).toBe(1);
		});
	}
});
