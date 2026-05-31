import {
	DEFAULT_SESSION_THREAD_TAIL_LIMIT,
	type ThreadMessageLike,
} from "@helmor/thread-schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createStreamingStore } from "@/components/chat";
import {
	createPairedDesktopClient,
	type DesktopConnection,
	type WorkspaceSendTarget,
} from "@/lib/remote";
import type { ThreadChatState } from "./workspace-chat-hooks";
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
	const streamingStore = useMemo(() => createStreamingStore(), []);

	useEffect(() => {
		if (!enabled) {
			setInput("");
			setThreadMessages([]);
			setIsGenerating(false);
			setError(null);
			streamingStore.set("");
		}
	}, [enabled, streamingStore]);

	const messages = useMemo(
		() => threadMessages.map(threadToChatMessage),
		[threadMessages],
	);

	const onSend = useCallback(() => {
		if (!enabled || !activeDesktop || !input.trim() || isGenerating) return;
		const prompt = input.trim();
		const startedAt = Date.now();
		let startedWorkspaceId: string | null = null;
		let startedSessionId: string | null = null;
		setInput("");
		setError(null);
		setIsGenerating(true);
		streamingStore.set("");
		setThreadMessages([
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
				await client.sendNewWorkspaceStream({ prompt, target }, (event) => {
					if (event.kind === "started") {
						startedWorkspaceId = event.workspaceId;
						startedSessionId = event.sessionId;
						onStarted(event.workspaceId, event.sessionId);
					}
					applyCompanionStreamEvent({
						event,
						setThreadMessages,
						streamingStore,
						setError,
						setIsGenerating,
					});
				});
				if (startedWorkspaceId && startedSessionId) {
					const page = await client.sessionThreadPage({
						sessionId: startedSessionId,
						tailLimit: DEFAULT_SESSION_THREAD_TAIL_LIMIT,
					});
					setThreadMessages(page.messages);
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
	}, [
		activeDesktop,
		enabled,
		input,
		isGenerating,
		onCompleted,
		onStarted,
		streamingStore,
		target,
	]);

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
