import type { ThreadMessageLike } from "@helmor/thread-schema";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { CompanionClient } from "./api";
import { MessageList } from "./Messages";
import {
	reconcileThreadMessages,
	textThreadMessage,
	upsertStreamingPartial,
} from "./message-state";
import {
	clearConnection,
	consumePairingFromHash,
	loadConnectionFromStorage,
} from "./pairing";
import type {
	CompanionStreamEvent,
	DesktopConnection,
	MobileWorkspaceGroup,
	MobileWorkspaceRow,
	UiMutationEvent,
	WorkspaceSessionSummary,
	WorkspaceSnapshot,
} from "./types";

const SELECTED_WORKSPACE_KEY = "helmor.mobileWeb.selectedWorkspaceId.v1";
const SELECTED_SESSION_KEY = "helmor.mobileWeb.selectedSessionId.v1";

export function App() {
	const [connection, setConnection] = useState<DesktopConnection | null>(() => {
		return consumePairingFromHash() ?? loadConnectionFromStorage();
	});
	const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
	const [sessions, setSessions] = useState<WorkspaceSessionSummary[]>([]);
	const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useStoredState(
		SELECTED_WORKSPACE_KEY,
	);
	const [selectedSessionId, setSelectedSessionId] =
		useStoredState(SELECTED_SESSION_KEY);
	const [loading, setLoading] = useState(false);
	const [threadLoading, setThreadLoading] = useState(false);
	const [sending, setSending] = useState(false);
	const [streamStatus, setStreamStatus] = useState("Disconnected");
	const [error, setError] = useState<string | null>(null);
	const client = useMemo(
		() => (connection ? new CompanionClient(connection) : null),
		[connection],
	);
	const selectedWorkspace = useMemo(
		() =>
			snapshot?.groups
				.flatMap((group) => group.rows)
				.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
		[snapshot, selectedWorkspaceId],
	);

	const refreshWorkspaces = useCallback(async () => {
		if (!client) return;
		setLoading(true);
		setError(null);
		try {
			await client.health();
			const next = await client.workspaceSnapshot();
			setSnapshot(next);
			const allWorkspaces = next.groups.flatMap((group) => group.rows);
			const selectedExists = allWorkspaces.some(
				(workspace) => workspace.id === selectedWorkspaceId,
			);
			if (!selectedWorkspaceId || !selectedExists) {
				const firstWorkspace = allWorkspaces[0] ?? null;
				setSelectedWorkspaceId(firstWorkspace?.id ?? null);
			}
		} catch (refreshError) {
			setError(errorMessage(refreshError));
		} finally {
			setLoading(false);
		}
	}, [client, selectedWorkspaceId, setSelectedWorkspaceId]);

	const refreshSessions = useCallback(
		async (workspaceId: string) => {
			if (!client) return;
			try {
				const next = await client.listWorkspaceSessions(workspaceId);
				setSessions(next);
				if (
					!selectedSessionId ||
					!next.some((item) => item.id === selectedSessionId)
				) {
					const fallback =
						next.find((item) => item.active)?.id ??
						selectedWorkspace?.activeSessionId ??
						selectedWorkspace?.primarySessionId ??
						next[0]?.id ??
						null;
					setSelectedSessionId(fallback);
				}
			} catch (refreshError) {
				setError(errorMessage(refreshError));
			}
		},
		[client, selectedSessionId, selectedWorkspace, setSelectedSessionId],
	);

	const refreshThread = useCallback(
		async (sessionId: string) => {
			if (!client) return;
			setThreadLoading(true);
			try {
				const page = await client.sessionThreadPage(sessionId);
				setMessages((previous) =>
					reconcileThreadMessages(previous, page.messages),
				);
				void client.markSessionRead(sessionId).catch(() => {});
			} catch (refreshError) {
				setError(errorMessage(refreshError));
			} finally {
				setThreadLoading(false);
			}
		},
		[client],
	);

	useEffect(() => {
		if (!client) return;
		void refreshWorkspaces();
	}, [client, refreshWorkspaces]);

	useEffect(() => {
		if (!selectedWorkspaceId) {
			setSessions([]);
			return;
		}
		setSessions([]);
		void refreshSessions(selectedWorkspaceId);
	}, [refreshSessions, selectedWorkspaceId]);

	useEffect(() => {
		if (!selectedSessionId) {
			setMessages([]);
			return;
		}
		setMessages([]);
		void refreshThread(selectedSessionId);
	}, [refreshThread, selectedSessionId]);

	useMutationStream({
		client,
		selectedWorkspaceId,
		selectedSessionId,
		refreshWorkspaces,
		refreshSessions,
		refreshThread,
		setStreamStatus,
	});

	const sendPrompt = useCallback(
		async (prompt: string) => {
			if (!client || !selectedSessionId || sending) return;
			const trimmed = prompt.trim();
			if (!trimmed) return;
			const startedAt = Date.now();
			setSending(true);
			setError(null);
			setMessages((previous) => [
				...previous,
				textThreadMessage({
					id: `mobile:${startedAt}:user`,
					role: "user",
					text: trimmed,
				}),
				textThreadMessage({
					id: `mobile:${startedAt}:assistant`,
					role: "assistant",
					text: "",
					streaming: true,
				}),
			]);
			try {
				await client.sendSessionMessageStream(
					selectedSessionId,
					trimmed,
					(event) => applyCompanionStreamEvent(event, setMessages, setError),
				);
				await refreshThread(selectedSessionId);
			} catch (sendError) {
				setError(errorMessage(sendError));
				await refreshThread(selectedSessionId);
			} finally {
				setSending(false);
			}
		},
		[client, refreshThread, selectedSessionId, sending],
	);

	if (!connection) {
		return <UnpairedScreen />;
	}

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="brand-block">
					<HelmorMark />
					<div>
						<div className="eyebrow">{connection.desktopName}</div>
						<h1>Helmor</h1>
					</div>
				</div>
				<button
					type="button"
					className="ghost-button"
					onClick={() => {
						clearConnection();
						setConnection(null);
					}}
				>
					Disconnect
				</button>
			</header>

			{error ? <div className="error-banner">{error}</div> : null}

			<main className="layout">
				<WorkspaceRail
					groups={snapshot?.groups ?? []}
					loading={loading}
					selectedWorkspaceId={selectedWorkspaceId}
					onSelect={(workspaceId) => {
						setSelectedWorkspaceId(workspaceId);
						setSelectedSessionId(null);
					}}
				/>
				<section className="chat-pane">
					<SessionTabs
						sessions={sessions}
						selectedSessionId={selectedSessionId}
						workspace={selectedWorkspace}
						onSelect={setSelectedSessionId}
					/>
					<div className="thread-header">
						<div>
							<div className="thread-title">
								{selectedWorkspace?.title ?? "Select a workspace"}
							</div>
							<div className="thread-subtitle">
								{threadLoading ? "Refreshing..." : streamStatus}
							</div>
						</div>
					</div>
					<div className="thread-scroll">
						<MessageList messages={messages} />
					</div>
					<Composer
						disabled={!selectedSessionId || sending}
						onSend={sendPrompt}
					/>
				</section>
			</main>
		</div>
	);
}

function WorkspaceRail({
	groups,
	loading,
	selectedWorkspaceId,
	onSelect,
}: {
	groups: MobileWorkspaceGroup[];
	loading: boolean;
	selectedWorkspaceId: string | null;
	onSelect: (workspaceId: string) => void;
}) {
	return (
		<aside className="workspace-rail">
			<div className="rail-heading">
				<span>Workspaces</span>
				<span>{groups.reduce((sum, group) => sum + group.rows.length, 0)}</span>
			</div>
			{loading && groups.length === 0 ? (
				<div className="muted-row">Loading...</div>
			) : null}
			{groups.map((group) =>
				group.rows.length > 0 ? (
					<section key={group.id} className="workspace-group">
						<div className="group-label">{group.label}</div>
						{group.rows.map((workspace) => (
							<button
								key={workspace.id}
								type="button"
								className={
									workspace.id === selectedWorkspaceId
										? "workspace-row selected"
										: "workspace-row"
								}
								onClick={() => onSelect(workspace.id)}
							>
								<span className="workspace-avatar">
									{workspace.repoInitials ?? workspace.title.slice(0, 2)}
								</span>
								<span className="workspace-copy">
									<span className="workspace-title">{workspace.title}</span>
									<span className="workspace-summary">{workspace.summary}</span>
								</span>
								{workspace.hasUnread ? (
									<span className="workspace-badge">
										{workspace.workspaceUnread || workspace.unreadSessionCount}
									</span>
								) : null}
							</button>
						))}
					</section>
				) : null,
			)}
		</aside>
	);
}

function SessionTabs({
	sessions,
	selectedSessionId,
	workspace,
	onSelect,
}: {
	sessions: WorkspaceSessionSummary[];
	selectedSessionId: string | null;
	workspace: MobileWorkspaceRow | null;
	onSelect: (sessionId: string) => void;
}) {
	return (
		<div className="session-tabs">
			{sessions.length === 0 ? (
				<div className="muted-row">
					{workspace ? "No sessions in this workspace." : "Pick a workspace."}
				</div>
			) : null}
			{sessions.map((session) => (
				<button
					key={session.id}
					type="button"
					className={
						session.id === selectedSessionId
							? "session-tab selected"
							: "session-tab"
					}
					onClick={() => onSelect(session.id)}
				>
					<span>{session.title}</span>
					{session.status ? <em>{session.status}</em> : null}
					{session.unreadCount > 0 ? <b>{session.unreadCount}</b> : null}
				</button>
			))}
		</div>
	);
}

function Composer({
	disabled,
	onSend,
}: {
	disabled: boolean;
	onSend: (prompt: string) => Promise<void>;
}) {
	const [value, setValue] = useState("");
	return (
		<form
			className="composer"
			onSubmit={(event) => {
				event.preventDefault();
				const prompt = value;
				setValue("");
				void onSend(prompt);
			}}
		>
			<textarea
				disabled={disabled}
				placeholder="Message Helmor..."
				value={value}
				onChange={(event) => setValue(event.currentTarget.value)}
			/>
			<button type="submit" disabled={disabled || !value.trim()}>
				Send
			</button>
		</form>
	);
}

function UnpairedScreen() {
	return (
		<div className="unpaired-screen">
			<div className="unpaired-card">
				<HelmorMark />
				<div className="eyebrow">Helmor Mobile</div>
				<h1>Pair this browser</h1>
				<p>
					Open Settings on desktop Helmor, create a Mobile Web QR, and scan it
					with this device.
				</p>
			</div>
		</div>
	);
}

function HelmorMark() {
	return (
		<div className="helmor-mark" aria-hidden="true">
			<span />
			<span />
			<span />
			<span />
			<span />
			<span />
		</div>
	);
}

function useMutationStream({
	client,
	selectedWorkspaceId,
	selectedSessionId,
	refreshWorkspaces,
	refreshSessions,
	refreshThread,
	setStreamStatus,
}: {
	client: CompanionClient | null;
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	refreshWorkspaces: () => Promise<void>;
	refreshSessions: (workspaceId: string) => Promise<void>;
	refreshThread: (sessionId: string) => Promise<void>;
	setStreamStatus: (status: string) => void;
}) {
	const latest = useRef({
		selectedWorkspaceId,
		selectedSessionId,
		refreshWorkspaces,
		refreshSessions,
		refreshThread,
	});
	latest.current = {
		selectedWorkspaceId,
		selectedSessionId,
		refreshWorkspaces,
		refreshSessions,
		refreshThread,
	};

	useEffect(() => {
		if (!client) return;
		let stopped = false;
		let retryMs = 500;
		let controller: AbortController | null = null;

		const run = async () => {
			while (!stopped) {
				controller = new AbortController();
				try {
					setStreamStatus("Live");
					await client.streamUiMutations((envelope) => {
						handleMutation(envelope.event, latest.current);
					}, controller.signal);
					if (!stopped) setStreamStatus("Reconnecting...");
				} catch {
					if (!stopped) setStreamStatus("Reconnecting...");
				}
				if (stopped) break;
				await delay(retryMs);
				retryMs = Math.min(retryMs * 2, 10_000);
			}
		};

		void run();
		return () => {
			stopped = true;
			controller?.abort();
		};
	}, [client, setStreamStatus]);
}

function handleMutation(
	event: UiMutationEvent,
	current: {
		selectedWorkspaceId: string | null;
		selectedSessionId: string | null;
		refreshWorkspaces: () => Promise<void>;
		refreshSessions: (workspaceId: string) => Promise<void>;
		refreshThread: (sessionId: string) => Promise<void>;
	},
) {
	if (
		event.type === "workspaceListChanged" ||
		event.type === "workspaceChanged"
	) {
		void current.refreshWorkspaces();
	}
	if (
		event.type === "sessionListChanged" &&
		typeof event.workspaceId === "string" &&
		event.workspaceId === current.selectedWorkspaceId
	) {
		void current.refreshSessions(event.workspaceId);
	}
	if (
		(event.type === "sessionMessagesAppended" ||
			event.type === "contextUsageChanged" ||
			event.type === "codexGoalChanged") &&
		typeof event.sessionId === "string" &&
		event.sessionId === current.selectedSessionId
	) {
		void current.refreshThread(event.sessionId);
	}
	if (event.type === "activeStreamsChanged" && current.selectedSessionId) {
		void current.refreshThread(current.selectedSessionId);
	}
}

function applyCompanionStreamEvent(
	event: CompanionStreamEvent,
	setMessages: Dispatch<SetStateAction<ThreadMessageLike[]>>,
	setError: (error: string | null) => void,
) {
	if (event.kind === "started") return;
	if (event.kind === "error") {
		setError(event.message);
		return;
	}
	const agentEvent = event.event;
	if (agentEvent.kind === "update") {
		const messages = Array.isArray(agentEvent.messages)
			? (agentEvent.messages as ThreadMessageLike[])
			: [];
		setMessages((previous) => reconcileThreadMessages(previous, messages));
		return;
	}
	if (agentEvent.kind === "streamingPartial") {
		const message = agentEvent.message as ThreadMessageLike | undefined;
		if (message) {
			setMessages((previous) => upsertStreamingPartial(previous, message));
		}
		return;
	}
	if (agentEvent.kind === "error") {
		setError(
			typeof agentEvent.message === "string"
				? agentEvent.message
				: "Stream failed",
		);
	}
}

function useStoredState(key: string) {
	const [value, setValue] = useState<string | null>(() =>
		window.localStorage.getItem(key),
	);
	const setStoredValue = useCallback(
		(next: string | null) => {
			setValue(next);
			if (next) {
				window.localStorage.setItem(key, next);
			} else {
				window.localStorage.removeItem(key);
			}
		},
		[key],
	);
	return [value, setStoredValue] as const;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
