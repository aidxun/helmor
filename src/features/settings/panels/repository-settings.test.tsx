import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepositoryCreateOption } from "@/lib/api";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings";
import { renderWithProviders } from "@/test/render-with-providers";
import { RepositorySettingsPanel } from "./repository-settings";

const apiMocks = vi.hoisted(() => ({
	listRemoteBranches: vi.fn(),
	listRepoRemotes: vi.fn(),
	listForgeAccounts: vi.fn(),
	loadRepoPreferences: vi.fn(),
	loadRepoScripts: vi.fn(),
	prefetchRemoteRefs: vi.fn(),
	updateRepositoryBranchPrefix: vi.fn(),
	updateRepositoryWorktreeLocation: vi.fn(),
}));

const dialogMocks = vi.hoisted(() => ({
	open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: dialogMocks.open,
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		listRemoteBranches: apiMocks.listRemoteBranches,
		listRepoRemotes: apiMocks.listRepoRemotes,
		listForgeAccounts: apiMocks.listForgeAccounts,
		loadRepoPreferences: apiMocks.loadRepoPreferences,
		loadRepoScripts: apiMocks.loadRepoScripts,
		prefetchRemoteRefs: apiMocks.prefetchRemoteRefs,
		updateRepositoryBranchPrefix: apiMocks.updateRepositoryBranchPrefix,
		updateRepositoryWorktreeLocation: apiMocks.updateRepositoryWorktreeLocation,
	};
});

function repo(
	overrides: Partial<RepositoryCreateOption>,
): RepositoryCreateOption {
	return {
		id: "repo-a",
		name: "Repo A",
		remote: "origin",
		remoteUrl: "git@github.com:acme/repo-a.git",
		defaultBranch: "main",
		forgeProvider: "github",
		forgeLogin: "octocat",
		branchPrefixType: "custom",
		repoInitials: "RA",
		...overrides,
	};
}

function renderPanel(repository: RepositoryCreateOption) {
	return renderWithProviders(
		<SettingsContext.Provider
			value={{
				settings: { ...DEFAULT_SETTINGS },
				isLoaded: true,
				updateSettings: vi.fn(),
			}}
		>
			<RepositorySettingsPanel
				repo={repository}
				workspaceId={null}
				onRepoSettingsChanged={vi.fn()}
				onRepoDeleted={vi.fn()}
			/>
		</SettingsContext.Provider>,
	);
}

describe("RepositorySettingsPanel branch prefix", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		apiMocks.listRemoteBranches.mockResolvedValue([]);
		apiMocks.listRepoRemotes.mockResolvedValue([]);
		apiMocks.listForgeAccounts.mockResolvedValue([]);
		apiMocks.loadRepoPreferences.mockResolvedValue({
			createPr: null,
			fixErrors: null,
			resolveConflicts: null,
			branchRename: null,
		});
		apiMocks.loadRepoScripts.mockResolvedValue({
			setupScript: null,
			runActions: [],
			archiveScript: null,
			setupFromProject: false,
			runFromProject: false,
			archiveFromProject: false,
			autoRunSetup: true,
		});
		apiMocks.prefetchRemoteRefs.mockResolvedValue({ fetched: false });
		apiMocks.updateRepositoryBranchPrefix.mockResolvedValue(undefined);
		apiMocks.updateRepositoryWorktreeLocation.mockResolvedValue(undefined);
		dialogMocks.open.mockReset();
		dialogMocks.open.mockResolvedValue(
			"/Users/aidan/mi/mihome/miot-plugin-sdk/projects",
		);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("cancels a pending custom-prefix save when switching repositories", () => {
		const { rerender } = renderPanel(
			repo({
				id: "repo-a",
				branchPrefixType: "custom",
				branchPrefixCustom: "a/",
			}),
		);

		fireEvent.change(screen.getByDisplayValue("a/"), {
			target: { value: "changed/" },
		});

		rerender(
			<SettingsContext.Provider
				value={{
					settings: { ...DEFAULT_SETTINGS },
					isLoaded: true,
					updateSettings: vi.fn(),
				}}
			>
				<RepositorySettingsPanel
					repo={repo({
						id: "repo-b",
						name: "Repo B",
						branchPrefixType: "custom",
						branchPrefixCustom: "b/",
					})}
					workspaceId={null}
					onRepoSettingsChanged={vi.fn()}
					onRepoDeleted={vi.fn()}
				/>
			</SettingsContext.Provider>,
		);

		vi.advanceTimersByTime(401);

		expect(apiMocks.updateRepositoryBranchPrefix).not.toHaveBeenCalled();
	});

	it("does not overwrite in-progress typing after a same-repo refresh", () => {
		const { rerender } = renderPanel(
			repo({
				id: "repo-a",
				branchPrefixType: "custom",
				branchPrefixCustom: "repo/",
			}),
		);

		fireEvent.change(screen.getByDisplayValue("repo/"), {
			target: { value: "repo/feature/" },
		});

		rerender(
			<SettingsContext.Provider
				value={{
					settings: { ...DEFAULT_SETTINGS },
					isLoaded: true,
					updateSettings: vi.fn(),
				}}
			>
				<RepositorySettingsPanel
					repo={repo({
						id: "repo-a",
						branchPrefixType: "custom",
						branchPrefixCustom: "repo/f",
					})}
					workspaceId={null}
					onRepoSettingsChanged={vi.fn()}
					onRepoDeleted={vi.fn()}
				/>
			</SettingsContext.Provider>,
		);

		expect(screen.getByDisplayValue("repo/feature/")).toBeInTheDocument();
	});

	it("renders the bound forge account login in the panel header", () => {
		renderPanel(
			repo({
				forgeLogin: "octocat",
			}),
		);

		expect(screen.getByText("@octocat")).toBeInTheDocument();
	});

	it("renders an unconnected header with a Connect CTA when forgeLogin is null", () => {
		renderPanel(
			repo({
				forgeLogin: null,
			}),
		);

		expect(screen.getByText("GitHub not connected")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /^Connect$/i }),
		).toBeInTheDocument();
	});

	it("saves a custom worktree location", async () => {
		vi.useRealTimers();
		renderPanel(repo({}));

		fireEvent.click(screen.getByRole("button", { name: /choose/i }));
		fireEvent.change(screen.getByLabelText("Directory template"), {
			target: { value: "{repoName}-{directoryName}" },
		});

		await waitFor(() => {
			expect(dialogMocks.open).toHaveBeenCalledWith({
				directory: true,
				multiple: false,
				defaultPath: undefined,
			});
			expect(screen.getByLabelText("Parent directory")).toHaveValue(
				"/Users/aidan/mi/mihome/miot-plugin-sdk/projects",
			);
		});
		fireEvent.click(screen.getByRole("button", { name: /save location/i }));

		await waitFor(() => {
			expect(apiMocks.updateRepositoryWorktreeLocation).toHaveBeenCalledWith(
				"repo-a",
				"/Users/aidan/mi/mihome/miot-plugin-sdk/projects",
				"{repoName}-{directoryName}",
			);
		});
	});
});
