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
	createStreamingStore,
} from "@/components/chat";
import { writeCachedThreadMessages } from "@/lib/local-cache";
import {
	createPairedDesktopClient,
	type DesktopConnection,
	type WorkspaceSendTarget,
} from "@/lib/remote";
import type { ThreadChatState } from "./workspace-chat-hooks";
import { reconcileAuthoritativeThreadMessages } from "./workspace-chat-message-state";
import {
	textThreadMessage,
	threadToChatMessage,
} from "./workspace-chat-message-utils";
import { applyCompanionStreamEvent } from "./workspace-chat-stream-events";

export function useNewWorkspaceThreadChat({
	activeDesktop,
	target,
	enabled,
	onStarted,
	onCompleted,
}: {
	activeDesktop: DesktopConnection | null;
	target: WorkspaceSendTarget;
	enabled: boolean;
	onStarted: (workspaceId: string, sessionId: string) => void;
	onCompleted: (workspaceId: string, sessionId: string) => Promise<void>;
}): ThreadChatState {
	const [input, setInput] = useState("");
	const [threadMessages, setThreadMessages] = useState<ThreadMessageLike[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const cacheTargetRef = useRef<{
		desktopId: string;
		sessionId: string;
	} | null>(null);
	const cacheWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const streamingStore = useMemo(() => createStreamingStore(), []);

	const cacheThreadMessages = useCallback(
		(messages: ThreadMessageLike[], delay = 250) => {
			const target = cacheTargetRef.current;
			if (!target) return;
			if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
			cacheWriteTimer.current = setTimeout(() => {
				void writeCachedThreadMessages({
					desktopId: target.desktopId,
					sessionId: target.sessionId,
					messages,
				}).catch(() => {});
			}, delay);
		},
		[],
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
		if (!enabled) {
			setInput("");
			setThreadMessages([]);
			cacheTargetRef.current = null;
			setIsGenerating(false);
			setError(null);
			streamingStore.set("");
		}
	}, [enabled, streamingStore]);

	const messages = useMemo(
		() => threadMessages.map(threadToChatMessage),
		[threadMessages],
	);

	const onSend = useCallback(
		(submit?: ChatComposerSubmit) => {
			const prompt = (submit?.prompt ?? input).trim();
			if (!enabled || !activeDesktop || !prompt || isGenerating) return;
			const startedAt = Date.now();
			const optimisticMessages = [
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
			];
			let startedWorkspaceId: string | null = null;
			let startedSessionId: string | null = null;
			setInput("");
			setError(null);
			setIsGenerating(true);
			streamingStore.set("");
			setThreadMessages(optimisticMessages);

			let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
				null;
			void (async () => {
				try {
					client = await createPairedDesktopClient(activeDesktop);
					await client.sendNewWorkspaceStream(
						{
							prompt,
							target,
							modelId: submit?.modelId,
							effortLevel: submit?.effortLevel,
							fastMode: submit?.fastMode,
						},
						(event) => {
							if (event.kind === "started") {
								startedWorkspaceId = event.workspaceId;
								startedSessionId = event.sessionId;
								cacheTargetRef.current = {
									desktopId: activeDesktop.desktopId,
									sessionId: event.sessionId,
								};
								cacheThreadMessages(optimisticMessages, 0);
								onStarted(event.workspaceId, event.sessionId);
							}
							applyCompanionStreamEvent({
								event,
								setThreadMessages: setThreadMessagesWithCache,
								streamingStore,
								setError,
								setIsGenerating,
							});
						},
					);
					if (startedWorkspaceId && startedSessionId) {
						const page = await client.sessionThreadPage({
							sessionId: startedSessionId,
							tailLimit: DEFAULT_SESSION_THREAD_TAIL_LIMIT,
						});
						setThreadMessagesFromServer(page.messages);
						await onCompleted(startedWorkspaceId, startedSessionId);
					}
				} catch (sendError) {
					setError(asError(sendError));
				} finally {
					setIsGenerating(false);
					streamingStore.set("");
					client?.close();
				}
			})();
		},
		[
			activeDesktop,
			enabled,
			input,
			isGenerating,
			onCompleted,
			onStarted,
			cacheThreadMessages,
			setThreadMessagesFromServer,
			setThreadMessagesWithCache,
			streamingStore,
			target,
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
		loading: false,
	};
}

function asError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}
