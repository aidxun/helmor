import type { MobileRepositoryOption, WorkspaceSendTarget } from "@/lib/remote";

export type NewChatMode = "chat" | "worktree" | "local";

export function modeFromTarget(target: WorkspaceSendTarget): NewChatMode {
	if (target.kind === "chat") return "chat";
	return target.mode;
}

export function normalizeNewChatTarget(
	target: WorkspaceSendTarget | null | undefined,
	repositories: MobileRepositoryOption[],
): WorkspaceSendTarget {
	if (!target || target.kind === "chat") return { kind: "chat" };
	if (target.kind !== "repo" || repositories.length === 0) {
		return { kind: "chat" };
	}

	const mode = target.mode === "local" ? "local" : "worktree";
	const repo =
		repositories.find((candidate) => candidate.id === target.repoId) ??
		repositories[0];

	return { kind: "repo", repoId: repo.id, mode };
}

export function targetForMode({
	mode,
	target,
	repositories,
}: {
	mode: NewChatMode;
	target: WorkspaceSendTarget;
	repositories: MobileRepositoryOption[];
}): WorkspaceSendTarget {
	if (mode === "chat") return { kind: "chat" };
	if (repositories.length === 0) return { kind: "chat" };

	const currentRepo =
		target.kind === "repo"
			? repositories.find((repo) => repo.id === target.repoId)
			: null;
	const repo = currentRepo ?? repositories[0];

	return { kind: "repo", repoId: repo.id, mode };
}

export function targetForRepository({
	repoId,
	target,
	repositories,
}: {
	repoId: string;
	target: WorkspaceSendTarget;
	repositories: MobileRepositoryOption[];
}): WorkspaceSendTarget {
	if (target.kind !== "repo") return target;
	const repo = repositories.find((candidate) => candidate.id === repoId);
	if (!repo) return normalizeNewChatTarget(target, repositories);
	return { ...target, repoId: repo.id };
}

export function parseWorkspaceSendTarget(
	value: unknown,
): WorkspaceSendTarget | null {
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
