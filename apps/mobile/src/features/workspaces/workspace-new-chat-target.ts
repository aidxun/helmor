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

	return {
		kind: "repo",
		repoId: repo.id,
		mode,
		sourceBranch: normalizeBranchForRepo(target.sourceBranch, repo, mode),
		branchIntent:
			mode === "worktree" ? normalizeBranchIntent(target.branchIntent) : null,
	};
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

	return {
		kind: "repo",
		repoId: repo.id,
		mode,
		sourceBranch:
			target.kind === "repo" && currentRepo?.id === repo.id
				? normalizeBranchForRepo(target.sourceBranch, repo, mode)
				: defaultBranchForRepo(repo, mode),
		branchIntent:
			mode === "worktree"
				? target.kind === "repo"
					? normalizeBranchIntent(target.branchIntent)
					: "from_branch"
				: null,
	};
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
	return {
		...target,
		repoId: repo.id,
		sourceBranch: defaultBranchForRepo(repo, target.mode),
	};
}

export function targetForBranch({
	branch,
	target,
	repositories,
}: {
	branch: string;
	target: WorkspaceSendTarget;
	repositories: MobileRepositoryOption[];
}): WorkspaceSendTarget {
	if (target.kind !== "repo") return target;
	const repo = repositories.find((candidate) => candidate.id === target.repoId);
	if (!repo) return normalizeNewChatTarget(target, repositories);
	return {
		...target,
		sourceBranch: normalizeBranchForRepo(branch, repo, target.mode),
	};
}

export function targetForBranchIntent({
	branchIntent,
	target,
}: {
	branchIntent: "from_branch" | "use_branch";
	target: WorkspaceSendTarget;
}): WorkspaceSendTarget {
	if (target.kind !== "repo" || target.mode !== "worktree") return target;
	return { ...target, branchIntent };
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
		return {
			kind: "repo",
			repoId: target.repoId,
			mode: target.mode,
			sourceBranch:
				typeof target.sourceBranch === "string" ? target.sourceBranch : null,
			branchIntent:
				target.mode === "worktree"
					? normalizeBranchIntent(target.branchIntent)
					: null,
		};
	}
	return null;
}

function defaultBranchForRepo(
	repo: MobileRepositoryOption,
	mode: "worktree" | "local",
): string {
	return (
		(mode === "local" ? repo.currentBranch : null) ??
		repo.defaultBranch ??
		repo.branches?.[0]?.name ??
		"main"
	);
}

function normalizeBranchForRepo(
	branch: string | null | undefined,
	repo: MobileRepositoryOption,
	mode: "worktree" | "local",
): string {
	if (branch && repo.branches?.some((candidate) => candidate.name === branch)) {
		return branch;
	}
	return defaultBranchForRepo(repo, mode);
}

function normalizeBranchIntent(value: unknown): "from_branch" | "use_branch" {
	return value === "use_branch" ? "use_branch" : "from_branch";
}
