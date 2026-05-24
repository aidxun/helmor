import { useChat } from "@ai-sdk/react";
import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ChatMessage,
	ChatProvider,
	Conversation,
	ConversationEmptyState,
	ConversationScrollButton,
	createStreamingStore,
	Message,
	MessageResponse,
	PromptInput,
	PromptInputAction,
	PromptInputBody,
	PromptInputSubmit,
	PromptInputTextarea,
	StreamingMessage,
} from "@/components/chat";
import { Icon } from "@/components/icon";
import { MainHeader } from "@/components/main-header";

const USE_MOCK = process.env.EXPO_PUBLIC_MOCK_AI !== "0";

// Throttle interval for streaming UI updates (~30fps)
const STREAMING_THROTTLE_MS = 32;

const MOCK_RESPONSES = [
	'I can help inspect a Helmor workspace and turn the current session into a clear next step.\n\nA good mobile flow should keep the important context close:\n\n- Workspace status\n- Recent agent activity\n- Files that changed\n- The next runnable action\n\n```ts\nconst nextStep = session.summary ?? "Open a workspace";\n```\n\nAsk me about any workspace when you are ready.',
	"Here is a compact way to think about a Helmor session:\n\n1. **Context**: which workspace and branch are active\n2. **Intent**: what the agent is currently trying to do\n3. **Evidence**: messages, files, and command output\n\nThe mobile shell can stay lightweight while still preserving those pieces.",
	"Helmor works best when it keeps local state understandable.\n\n> Every agent turn should leave a trail you can inspect.\n\nThat means the mobile client should favor:\n\n- Fast session switching\n- Clear streaming status\n- Reliable workspace labels\n- Minimal hidden state\n\nI can help shape that into a concrete screen.",
	"For a first mobile skeleton, mock streaming is enough to validate the interaction model.\n\nThe next real integration point is a typed bridge that can load sessions and stream messages without changing the chat surface:\n\n```ts\nfor await (const event of agentStream) {\n  appendMessageEvent(event);\n}\n```\n\nThat keeps the UI stable while the backend wiring evolves.",
];

async function mockStreamResponse(
	text: string,
	onToken: (token: string) => void,
	signal?: AbortSignal,
) {
	const words = text.split(/(?<=\s)/);
	for (const word of words) {
		if (signal?.aborted) return;
		await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
		onToken(word);
	}
}

/** Extract text content from a UIMessage's parts array. */
function getTextFromParts(
	parts: Array<{ type: string; text?: string }>,
): string {
	return parts
		.filter((p) => p.type === "text" && p.text)
		.map((p) => p.text)
		.join("");
}

function useAIChat() {
	const [input, setInput] = useState("");
	const streamingStore = useMemo(() => createStreamingStore(), []);
	const prevStreamingTextRef = useRef("");

	const { messages: uiMessages, sendMessage, status, error } = useChat();

	const isStreaming = status === "streaming";

	// Map UIMessages to ChatMessages
	const messages: ChatMessage[] = useMemo(() => {
		return uiMessages.map((m) => ({
			id: m.id,
			role: m.role as "user" | "assistant",
			content:
				isStreaming &&
				m.role === "assistant" &&
				m === uiMessages[uiMessages.length - 1]
					? "" // Signal streaming — content comes from store
					: getTextFromParts(m.parts as Array<{ type: string; text?: string }>),
		}));
	}, [uiMessages, isStreaming]);

	// Sync streaming text to the store
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
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		sendMessage({ text: input });
		setInput("");
	}, [input, isStreaming, sendMessage]);

	return {
		messages,
		input,
		setInput,
		isGenerating: isStreaming,
		onSend,
		streamingStore,
		error: error ?? null,
	};
}

function useMockChat() {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const streamingStore = useMemo(() => createStreamingStore(), []);
	const streamingRef = useRef("");
	const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mockIndexRef = useRef(0);

	const handleSend = useCallback(async () => {
		if (!input.trim() || isGenerating) return;

		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

		const userMessage: ChatMessage = {
			id: Date.now().toString(),
			role: "user",
			content: input.trim(),
		};

		const assistantMessage: ChatMessage = {
			id: (Date.now() + 1).toString(),
			role: "assistant",
			content: "",
		};

		const newMessages = [...messages, userMessage, assistantMessage];
		setMessages(newMessages);
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
						streamingStore.set(streamingRef.current);
						throttleRef.current = null;
					}, STREAMING_THROTTLE_MS);
				}
			});
		} catch (err) {
			console.error("Generation error:", err);
			streamingRef.current = "Error generating response";
		} finally {
			if (throttleRef.current) {
				clearTimeout(throttleRef.current);
				throttleRef.current = null;
			}
			const finalContent = streamingRef.current;
			setMessages((prev) => {
				const updated = [...prev];
				const lastIdx = updated.length - 1;
				updated[lastIdx] = {
					...updated[lastIdx],
					content: finalContent,
				};
				return updated;
			});
			streamingRef.current = "";
			streamingStore.set("");
			setIsGenerating(false);

			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		}
	}, [input, isGenerating, messages, streamingStore]);

	return {
		messages,
		input,
		setInput,
		isGenerating,
		onSend: handleSend,
		streamingStore,
	};
}

export default function ChatScreen() {
	// biome-ignore lint/correctness/useHookAtTopLevel: the compile-time flag selects the mock or API chat backend.
	const chat = USE_MOCK ? useMockChat() : useAIChat(); // eslint-disable-line react-hooks/rules-of-hooks
	const { isGenerating, streamingStore } = chat;

	const renderMessage = useCallback(
		({ item }: { item: ChatMessage }) => {
			if (item.role === "user") {
				return <Message from="user">{item.content}</Message>;
			}

			const isStreaming = isGenerating && item.content === "";
			return (
				<Message from="assistant">
					{isStreaming ? (
						<StreamingMessage store={streamingStore} />
					) : (
						<MessageResponse>{item.content}</MessageResponse>
					)}
				</Message>
			);
		},
		[isGenerating, streamingStore],
	);

	return (
		<>
			<ChatProvider value={chat}>
				<Conversation
					renderMessage={renderMessage}
					emptyState={
						<ConversationEmptyState
							title="Helmor"
							description="Ask about a workspace or session to get started"
						/>
					}
				>
					<ConversationScrollButton />
					<PromptInput>
						<Link href="/attachments" asChild>
							<PromptInputAction>
								<Icon icon={Plus} className="w-5 h-5 text-muted-foreground" />
							</PromptInputAction>
						</Link>
						<PromptInputBody>
							<PromptInputTextarea placeholder="Chat with Helmor..." />
							<PromptInputSubmit />
						</PromptInputBody>
					</PromptInput>
				</Conversation>
			</ChatProvider>
			<MainHeader />
		</>
	);
}
