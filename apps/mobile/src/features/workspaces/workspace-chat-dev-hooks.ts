import { useChat } from "@ai-sdk/react";
import type { ThreadMessageLike } from "@helmor/thread-schema";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStreamingStore } from "@/components/chat";
import type { ThreadChatState } from "./workspace-chat-hooks";
import {
	getTextFromParts,
	replaceLastAssistantText,
	textThreadMessage,
	threadToChatMessage,
} from "./workspace-chat-message-utils";

const STREAMING_THROTTLE_MS = 32;

const MOCK_RESPONSES = [
	'I can help inspect this workspace and turn the current session into a clear next step.\n\nA useful mobile workspace view should keep the important context close:\n\n- Workspace status\n- Recent agent activity\n- Files that changed\n- The next runnable action\n\n```ts\nconst nextStep = session.summary ?? "Open a workspace";\n```\n\nAsk me about the selected workspace when you are ready.',
	"Here is a compact way to think about a workspace session:\n\n1. **Context**: which workspace and branch are active\n2. **Intent**: what the agent is currently trying to do\n3. **Evidence**: messages, files, and command output\n\nThe mobile shell can stay lightweight while still preserving those pieces.",
	"Helmor works best when it keeps local state understandable.\n\n> Every agent turn should leave a trail you can inspect.\n\nThat means the mobile client should favor:\n\n- Fast session switching\n- Clear streaming status\n- Reliable workspace labels\n- Minimal hidden state",
	"For this mobile surface, mock streaming is enough to validate the interaction model.\n\nThe next real integration point is a typed bridge that can load session messages and stream updates without changing the chat surface:\n\n```ts\nfor await (const event of agentStream) {\n  appendMessageEvent(event);\n}\n```",
];

export function useAIChatState(): ThreadChatState {
	const [input, setInput] = useState("");
	const streamingStore = useMemo(() => createStreamingStore(), []);
	const prevStreamingTextRef = useRef("");
	const { messages: uiMessages, sendMessage, status, error } = useChat();
	const isStreaming = status === "streaming";

	const threadMessages: ThreadMessageLike[] = useMemo(() => {
		return uiMessages.map((message) => ({
			id: message.id,
			role: message.role as "user" | "assistant",
			streaming:
				isStreaming &&
				message.role === "assistant" &&
				message === uiMessages[uiMessages.length - 1],
			content: [
				{
					type: "text",
					id: `${message.id}:text`,
					text: getTextFromParts(
						message.parts as Array<{ type: string; text?: string }>,
					),
				},
			],
		}));
	}, [uiMessages, isStreaming]);

	const messages = useMemo(
		() => threadMessages.map(threadToChatMessage),
		[threadMessages],
	);

	useEffect(() => {
		if (!isStreaming) {
			if (prevStreamingTextRef.current) {
				prevStreamingTextRef.current = "";
				streamingStore.set("");
			}
			return;
		}

		const lastMessage = uiMessages[uiMessages.length - 1];
		if (lastMessage?.role === "assistant") {
			const text = getTextFromParts(
				lastMessage.parts as Array<{ type: string; text?: string }>,
			);
			if (text !== prevStreamingTextRef.current) {
				prevStreamingTextRef.current = text;
				streamingStore.set(text);
			}
		}
	}, [uiMessages, isStreaming, streamingStore]);

	const onSend = useCallback(() => {
		if (!input.trim() || isStreaming) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		sendMessage({ text: input });
		setInput("");
	}, [input, isStreaming, sendMessage]);

	return {
		messages,
		threadMessages,
		input,
		setInput,
		isGenerating: isStreaming,
		onSend,
		streamingStore,
		error: error ?? null,
		loading: false,
	};
}

export function useMockChatState(): ThreadChatState {
	const [input, setInput] = useState("");
	const [threadMessages, setThreadMessages] = useState<ThreadMessageLike[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const streamingStore = useMemo(() => createStreamingStore(), []);
	const streamingRef = useRef("");
	const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mockIndexRef = useRef(0);

	const handleSend = useCallback(async () => {
		if (!input.trim() || isGenerating) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

		const startedAt = Date.now();
		const userMessage = textThreadMessage({
			id: `${startedAt}:user`,
			role: "user",
			text: input.trim(),
		});
		const assistantMessage = textThreadMessage({
			id: `${startedAt}:assistant`,
			role: "assistant",
			text: "",
			streaming: true,
		});

		setThreadMessages((previous) => [
			...previous,
			userMessage,
			assistantMessage,
		]);
		setInput("");
		setIsGenerating(true);
		streamingRef.current = "";
		streamingStore.set("");

		try {
			const mockText =
				MOCK_RESPONSES[mockIndexRef.current % MOCK_RESPONSES.length];
			mockIndexRef.current++;
			await mockStreamResponse(mockText, (token) => {
				streamingRef.current += token;
				if (!throttleRef.current) {
					throttleRef.current = setTimeout(() => {
						setThreadMessages((previous) =>
							replaceLastAssistantText(previous, streamingRef.current, true),
						);
						streamingStore.set(streamingRef.current);
						throttleRef.current = null;
					}, STREAMING_THROTTLE_MS);
				}
			});
		} catch (streamError) {
			console.error("Generation error:", streamError);
			streamingRef.current = "Error generating response";
		} finally {
			if (throttleRef.current) {
				clearTimeout(throttleRef.current);
				throttleRef.current = null;
			}
			const finalContent = streamingRef.current;
			setThreadMessages((previous) =>
				replaceLastAssistantText(previous, finalContent, false),
			);
			streamingRef.current = "";
			streamingStore.set("");
			setIsGenerating(false);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		}
	}, [input, isGenerating, streamingStore]);

	const messages = useMemo(
		() => threadMessages.map(threadToChatMessage),
		[threadMessages],
	);

	return {
		messages,
		threadMessages,
		input,
		setInput,
		isGenerating,
		onSend: handleSend,
		streamingStore,
		error: null,
		loading: false,
	};
}

async function mockStreamResponse(
	text: string,
	onToken: (token: string) => void,
	signal?: AbortSignal,
) {
	const words = text.split(/(?<=\s)/);
	for (const word of words) {
		if (signal?.aborted) return;
		await new Promise((resolve) =>
			setTimeout(resolve, 30 + Math.random() * 40),
		);
		onToken(word);
	}
}
