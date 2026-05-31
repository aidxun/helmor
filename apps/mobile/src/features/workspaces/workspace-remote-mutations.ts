import type { UiMutationEvent } from "@/lib/remote";

export function handleWorkspaceRemoteMutation(
	event: UiMutationEvent,
	refreshWorkspaces: () => Promise<void>,
	refreshWorkspacesSoon: () => void,
	refreshThread: () => void,
) {
	switch (event.type) {
		case "workspaceListChanged":
		case "workspaceChanged":
		case "sessionListChanged":
		case "workspaceGitStateChanged":
		case "workspaceForgeChanged":
		case "workspaceChangeRequestChanged":
		case "repositoryListChanged":
		case "repositoryChanged":
		case "settingsChanged":
		case "triageWorkspaceCreated":
			void refreshWorkspaces();
			break;
		case "workspaceFilesChanged":
		case "repoRunActionsChanged":
		case "pairedDevicesChanged":
		case "pendingCliSendQueued":
		case "slackWorkspacesChanged":
		case "slackTokenInvalidated":
		case "triageConfigChanged":
		case "triageActiveStatusChanged":
		case "fastModeUnavailable":
			break;
		case "sessionMessagesAppended":
		case "contextUsageChanged":
		case "codexGoalChanged":
		case "activeStreamsChanged":
			refreshThread();
			refreshWorkspacesSoon();
			break;
		default:
			break;
	}
}
