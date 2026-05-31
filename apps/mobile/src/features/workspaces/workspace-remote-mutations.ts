import type { UiMutationEvent } from "@/lib/remote";

export function handleWorkspaceRemoteMutation(
	event: UiMutationEvent,
	refreshWorkspaces: () => Promise<void>,
	refreshThread: () => void,
) {
	switch (event.type) {
		case "workspaceListChanged":
		case "workspaceChanged":
		case "sessionListChanged":
		case "repositoryListChanged":
		case "repositoryChanged":
		case "settingsChanged":
			void refreshWorkspaces();
			break;
		case "sessionMessagesAppended":
		case "contextUsageChanged":
		case "codexGoalChanged":
		case "activeStreamsChanged":
			refreshThread();
			void refreshWorkspaces();
			break;
		default:
			break;
	}
}
