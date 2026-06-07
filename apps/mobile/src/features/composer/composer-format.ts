import type {
	MobileDesktopConnectionState,
	WorkspaceContextValue,
} from "@/features/workspaces/workspace-context-core";

export type ComposerConnectionBanner = {
	tone: "loading" | "error";
	title: string;
	message: string;
};

export function formatEffort(level: string): string {
	if (level === "xhigh") return "Extra High";
	return level.slice(0, 1).toUpperCase() + level.slice(1);
}

export function formatEffortCompact(level: string): string {
	switch (level) {
		case "medium":
			return "Med";
		case "xhigh":
			return "XHigh";
		default:
			return formatEffort(level);
	}
}

export function compactModelLabel(label: string): string {
	const compact = label
		.replace(/\s+/g, " ")
		.replace(/\s+1M$/i, "")
		.replace(/^Claude\s+/i, "")
		.trim();
	return compact || "Select model";
}

export function composerConnectionBanner({
	hasActiveDesktop,
	connectionState,
	syncStatus,
	syncError,
	sendError,
}: {
	hasActiveDesktop: boolean;
	connectionState: MobileDesktopConnectionState;
	syncStatus: WorkspaceContextValue["syncStatus"];
	syncError: string | null;
	sendError?: string | null;
}): ComposerConnectionBanner | null {
	if (!hasActiveDesktop) {
		return {
			tone: "error",
			title: "Connection · Offline",
			message: "Connect a desktop to send prompts.",
		};
	}

	if (sendError) {
		return {
			tone: "error",
			title: "Connection · Error",
			message: sendError,
		};
	}

	if (syncStatus === "error") {
		return {
			tone: "error",
			title: "Connection · Sync failed",
			message: syncError || "Could not sync with your desktop.",
		};
	}

	if (connectionState.status === "reconnecting") {
		return {
			tone: "loading",
			title: "Connection · Reconnecting",
			message: "Trying to reconnect to your desktop.",
		};
	}

	if (connectionState.status === "connecting") {
		return {
			tone: "loading",
			title: "Connection · Connecting",
			message: "Connecting to your desktop.",
		};
	}

	if (connectionState.status === "error") {
		return {
			tone: "error",
			title: "Connection · Error",
			message: connectionState.message || "Could not connect to your desktop.",
		};
	}

	return null;
}

export function labelForTarget(
	target?: { kind: "chat" } | { kind: "repo"; mode: "worktree" | "local" },
): string | null {
	if (!target) return null;
	if (target.kind === "chat") return "Just Chat";
	return target.mode === "local" ? "Local Repo" : "Worktree";
}
