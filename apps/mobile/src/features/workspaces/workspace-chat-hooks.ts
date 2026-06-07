import {
	DEFAULT_SESSION_THREAD_TAIL_LIMIT,
	type ThreadMessageLike,
} from "@helmor/thread-schema";
import {
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type ChatComposerSubmit,
	type ChatContextValue,
	createStreamingStore,
} from "@/components/chat";
import {
	loadCachedThreadMessages,
	writeCachedThreadMessages,
} from "@/lib/local-cache";
import {
	createPairedDesktopClient,
	type DesktopConnection,
} from "@/lib/remote";
import { reconcileAuthoritativeThreadMessages } from "./workspace-chat-message-state";
import {
	textThreadMessage,
	threadToChatMessage,
} from "./workspace-chat-message-utils";
import { applyCompanionStreamEvent } from "./workspace-chat-stream-events";

export type ThreadChatState = ChatContextValue & {
	threadMessages: ThreadMessageLike[];
	loading: boolean;
};

export function useWorkspaceFallbackSession({
	activeDesktop,
	workspaceId,
	enabled,
}: {
	activeDesktop: DesktopConnection | null;
	workspaceId: string | null;
	enabled: boolean;
}): { sessionId: string | null; loading: boolean } {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!enabled || !activeDesktop || !workspaceId) {
			setSessionId(null);
			setLoading(false);
			return;
		}

		let canceled = false;
		let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
			null;

		setLoading(true);
		void (async () => {
			try {
				client = await createPairedDesktopClient(activeDesktop);
				const sessions = await client.listWorkspaceSessions(workspaceId);
				if (canceled) return;
				const selected =
					sessions.find((session) => session.active) ?? sessions[0] ?? null;
				setSessionId(selected?.id ?? null);
			} catch {
				if (!canceled) setSessionId(null);
			} finally {
				if (!canceled) setLoading(false);
				client?.close();
			}
		})();

		return () => {
			canceled = true;
			client?.close();
		};
	}, [activeDesktop, enabled, workspaceId]);

	return { sessionId, loading };
}

export function useDesktopThreadChat({
	activeDesktop,
	sessionId,
	enabled,
	refreshVersion,
}: {
	activeDesktop: DesktopConnection | null;
	sessionId: string | null;
	enabled: boolean;
	refreshVersion?: number;
}): ThreadChatState {
	const [input, setInput] = useState("");
	const [threadMessages, setThreadMessages] = useState<ThreadMessageLike[]>([]);
	const [loading, setLoading] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const cacheWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadedSessionId = useRef<string | null>(null);
	const streamingStore = useMemo(() => createStreamingStore(), []);
	const desktopId = activeDesktop?.desktopId ?? null;
	const desktopHost = activeDesktop?.host ?? null;
	const desktopPat = activeDesktop?.pat ?? null;

	const cacheThreadMessages = useCallback(
		(messages: ThreadMessageLike[], delay = 250) => {
			if (!desktopId || !sessionId) return;
			if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
			cacheWriteTimer.current = setTimeout(() => {
				void writeCachedThreadMessages({
					desktopId,
					sessionId,
					messages,
				}).catch(() => {});
			}, delay);
		},
		[desktopId, sessionId],
	);

	const setThreadMessagesWithCache = useCallback(
		(value: SetStateAction<ThreadMessageLike[]>) => {
			setThreadMessages((previous) => {
				const next =
					typeof value === "function"
						? (value as (state: ThreadMessageLike[]) => ThreadMessageLike[])(
								previous,
							)
						: value;
				cacheThreadMessages(next);
				return next;
			});
		},
		[cacheThreadMessages],
	);

	const setThreadMessagesFromServer = useCallback(
		(messages: ThreadMessageLike[]) => {
			setThreadMessages((previous) => {
				const next = reconcileAuthoritativeThreadMessages(previous, messages);
				if (messages.length > 0) cacheThreadMessages(next);
				return next;
			});
		},
		[cacheThreadMessages],
	);

	useEffect(() => {
		return () => {
			if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
		};
	}, []);

	useEffect(() => {
		if (!enabled || !activeDesktop || !sessionId) {
			loadedSessionId.current = null;
			setThreadMessages([]);
			setLoading(false);
			setError(null);
			return;
		}

		let canceled = false;
		let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
			null;

		setLoading(true);
		setError(null);
		void (async () => {
			try {
				const cached = await loadCachedThreadMessages(
					activeDesktop.desktopId,
					sessionId,
				);
				if (!canceled && cached) {
					setThreadMessages(cached.messages);
				}
				client = await createPairedDesktopClient(activeDesktop);
				const page = await client.sessionThreadPage({
					sessionId,
					tailLimit: DEFAULT_SESSION_THREAD_TAIL_LIMIT,
				});
				if (canceled) return;
				setThreadMessagesFromServer(page.messages);
				try {
					await client.markSessionRead(sessionId);
				} catch {
					// Read state is best-effort; losing it should not blank the thread.
				}
			} catch (loadError) {
				if (!canceled) setError(asError(loadError));
			} finally {
				if (!canceled) setLoading(false);
				client?.close();
			}
		})();

		return () => {
			canceled = true;
			client?.close();
		};
	}, [
		desktopHost,
		desktopId,
		desktopPat,
		enabled,
		refreshVersion,
		sessionId,
		setThreadMessagesFromServer,
	]);

	const messages = useMemo(
		() => threadMessages.map(threadToChatMessage),
		[threadMessages],
	);

	const onSend = useCallback(
		(submit?: ChatComposerSubmit) => {
			const prompt = (submit?.prompt ?? input).trim();
			if (!prompt) return;
			if (!activeDesktop || !sessionId || isGenerating) return;
			const startedAt = Date.now();
			setInput("");
			setError(null);
			setIsGenerating(true);
			streamingStore.set("");
			setThreadMessagesWithCache((previous) => [
				...previous,
				textThreadMessage({
					id: `mobile:${startedAt}:user`,
					role: "user",
					text: prompt,
				}),
				textThreadMessage({
					id: `mobile:${startedAt}:assistant`,
					role: "assistant",
					text: "",
					streaming: true,
				}),
			]);

			let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
				null;
			void (async () => {
				try {
					client = await createPairedDesktopClient(activeDesktop);
					await client.sendSessionMessageStream(
						sessionId,
						{
							prompt,
							modelId: submit?.modelId,
							effortLevel: submit?.effortLevel,
							fastMode: submit?.fastMode,
						},
						(event) =>
							applyCompanionStreamEvent({
								event,
								setThreadMessages: setThreadMessagesWithCache,
								streamingStore,
								setError,
								setIsGenerating,
							}),
					);
					const page = await client.sessionThreadPage({
						sessionId,
						tailLimit: DEFAULT_SESSION_THREAD_TAIL_LIMIT,
					});
					setThreadMessagesFromServer(page.messages);
				} catch (sendError) {
					setError(asError(sendError));
					try {
						const page = await client?.sessionThreadPage({
							sessionId,
							tailLimit: DEFAULT_SESSION_THREAD_TAIL_LIMIT,
						});
						if (page) {
							setThreadMessagesFromServer(page.messages);
						}
					} catch {}
				} finally {
					setIsGenerating(false);
					streamingStore.set("");
					client?.close();
				}
			})();
		},
		[
			activeDesktop,
			input,
			isGenerating,
			sessionId,
			setThreadMessagesFromServer,
			setThreadMessagesWithCache,
			streamingStore,
		],
	);

	return {
		messages,
		threadMessages,
		input,
		setInput,
		isGenerating,
		onSend,
		streamingStore,
		error,
		loading,
	};
}

function asError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}
