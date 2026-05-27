import {
	DEFAULT_SESSION_THREAD_TAIL_LIMIT,
	type ThreadMessageLike,
} from "@helmor/thread-schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ChatContextValue, createStreamingStore } from "@/components/chat";
import {
	createPairedDesktopClient,
	type DesktopConnection,
} from "@/lib/remote";
import { threadToChatMessage } from "./workspace-chat-message-utils";

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
}: {
	activeDesktop: DesktopConnection | null;
	sessionId: string | null;
	enabled: boolean;
}): ThreadChatState {
	const [input, setInput] = useState("");
	const [threadMessages, setThreadMessages] = useState<ThreadMessageLike[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const streamingStore = useMemo(() => createStreamingStore(), []);

	useEffect(() => {
		if (!enabled || !activeDesktop || !sessionId) {
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
				client = await createPairedDesktopClient(activeDesktop);
				const page = await client.sessionThreadPage({
					sessionId,
					tailLimit: DEFAULT_SESSION_THREAD_TAIL_LIMIT,
				});
				if (canceled) return;
				setThreadMessages(page.messages);
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
	}, [activeDesktop, enabled, sessionId]);

	const messages = useMemo(
		() => threadMessages.map(threadToChatMessage),
		[threadMessages],
	);

	const onSend = useCallback(() => {
		if (!input.trim()) return;
		setError(new Error("Sending from mobile is not connected yet."));
	}, [input]);

	return {
		messages,
		threadMessages,
		input,
		setInput,
		isGenerating: false,
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
