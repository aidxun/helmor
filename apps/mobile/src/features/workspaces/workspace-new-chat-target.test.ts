import { describe, expect, it } from "vitest";
import type { MobileRepositoryOption, WorkspaceSendTarget } from "@/lib/remote";
import {
	normalizeNewChatTarget,
	parseWorkspaceSendTarget,
	targetForMode,
	targetForRepository,
} from "./workspace-new-chat-target";

const repos: MobileRepositoryOption[] = [
	{ id: "repo-a", name: "Alpha" },
	{ id: "repo-b", name: "Beta" },
];

describe("new chat target helpers", () => {
	it("defaults missing targets to chat", () => {
		expect(normalizeNewChatTarget(null, repos)).toEqual({ kind: "chat" });
	});

	it("keeps chat targets as chat", () => {
		expect(normalizeNewChatTarget({ kind: "chat" }, repos)).toEqual({
			kind: "chat",
		});
	});

	it("keeps a valid repository target", () => {
		expect(
			normalizeNewChatTarget(
				{ kind: "repo", repoId: "repo-b", mode: "local" },
				repos,
			),
		).toEqual({ kind: "repo", repoId: "repo-b", mode: "local" });
	});

	it("falls back to the first repo when the cached repo is missing", () => {
		expect(
			normalizeNewChatTarget(
				{ kind: "repo", repoId: "missing", mode: "worktree" },
				repos,
			),
		).toEqual({ kind: "repo", repoId: "repo-a", mode: "worktree" });
	});

	it("falls back to chat when no repositories are available", () => {
		expect(
			normalizeNewChatTarget(
				{ kind: "repo", repoId: "repo-a", mode: "local" },
				[],
			),
		).toEqual({ kind: "chat" });
	});

	it("builds targets from selected modes", () => {
		const current: WorkspaceSendTarget = {
			kind: "repo",
			repoId: "repo-b",
			mode: "worktree",
		};

		expect(
			targetForMode({ mode: "local", target: current, repositories: repos }),
		).toEqual({ kind: "repo", repoId: "repo-b", mode: "local" });
		expect(
			targetForMode({ mode: "chat", target: current, repositories: repos }),
		).toEqual({ kind: "chat" });
	});

	it("changes repositories without changing the current repo mode", () => {
		expect(
			targetForRepository({
				repoId: "repo-a",
				target: { kind: "repo", repoId: "repo-b", mode: "local" },
				repositories: repos,
			}),
		).toEqual({ kind: "repo", repoId: "repo-a", mode: "local" });
	});

	it("parses persisted targets defensively", () => {
		expect(parseWorkspaceSendTarget({ kind: "chat" })).toEqual({
			kind: "chat",
		});
		expect(
			parseWorkspaceSendTarget({
				kind: "repo",
				repoId: "repo-a",
				mode: "worktree",
			}),
		).toEqual({ kind: "repo", repoId: "repo-a", mode: "worktree" });
		expect(parseWorkspaceSendTarget({ kind: "repo" })).toBeNull();
	});
});
