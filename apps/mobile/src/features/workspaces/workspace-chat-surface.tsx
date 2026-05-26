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
import { useWorkspaces } from "./workspace-context";

const USE_MOCK = process.env.EXPO_PUBLIC_MOCK_AI !== "0";
const STREAMING_THROTTLE_MS = 32;

const MOCK_RESPONSES = [
	'I can help inspect this workspace and turn the current session into a clear next step.\n\nA useful mobile workspace view should keep the important context close:\n\n- Workspace status\n- Recent agent activity\n- Files that changed\n- The next runnable action\n\n```ts\nconst nextStep = session.summary ?? "Open a workspace";\n```\n\nAsk me about the selected workspace when you are ready.',
	"Here is a compact way to think about a workspace session:\n\n1. **Context**: which workspace and branch are active\n2. **Intent**: what the agent is currently trying to do\n3. **Evidence**: messages, files, and command output\n\nThe mobile shell can stay lightweight while still preserving those pieces.",
	"Helmor works best when it keeps local state understandable.\n\n> Every agent turn should leave a trail you can inspect.\n\nThat means the mobile client should favor:\n\n- Fast session switching\n- Clear streaming status\n- Reliable workspace labels\n- Minimal hidden state",
	"For this mobile surface, mock streaming is enough to validate the interaction model.\n\nThe next real integration point is a typed bridge that can load session messages and stream updates without changing the chat surface:\n\n```ts\nfor await (const event of agentStream) {\n  appendMessageEvent(event);\n}\n```",
];

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

function getTextFromParts(
	parts: Array<{ type: string; text?: string }>,
): string {
	return parts
		.filter((part) => part.type === "text" && part.text)
		.map((part) => part.text)
		.join("");
}

function useAIChat() {
	const [input, setInput] = useState("");
	const streamingStore = useMemo(() => createStreamingStore(), []);
	const prevStreamingTextRef = useRef("");

	const { messages: uiMessages, sendMessage, status, error } = useChat();
	const isStreaming = status === "streaming";

	const messages: ChatMessage[] = useMemo(() => {
		return uiMessages.map((message) => ({
			id: message.id,
			role: message.role as "user" | "assistant",
			content:
				isStreaming &&
				message.role === "assistant" &&
				message === uiMessages[uiMessages.length - 1]
					? ""
					: getTextFromParts(
							message.parts as Array<{ type: string; text?: string }>,
						),
		}));
	}, [uiMessages, isStreaming]);

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

		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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

		setMessages((previous) => [...previous, userMessage, assistantMessage]);
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
		} catch (error) {
			console.error("Generation error:", error);
			streamingRef.current = "Error generating response";
		} finally {
			if (throttleRef.current) {
				clearTimeout(throttleRef.current);
				throttleRef.current = null;
			}

			const finalContent = streamingRef.current;
			setMessages((previous) => {
				const updated = [...previous];
				const lastIndex = updated.length - 1;
				updated[lastIndex] = {
					...updated[lastIndex],
					content: finalContent,
				};
				return updated;
			});
			streamingRef.current = "";
			streamingStore.set("");
			setIsGenerating(false);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		}
	}, [input, isGenerating, streamingStore]);

	return {
		messages,
		input,
		setInput,
		isGenerating,
		onSend: handleSend,
		streamingStore,
		error: null,
	};
}

export function WorkspaceChatSurface() {
	const {
		newWorkspaceDraftKey,
		selectedWorkspace,
		selectedWorkspaceSessionId,
	} = useWorkspaces();
	const contentKey =
		newWorkspaceDraftKey ??
		`${selectedWorkspace?.id ?? "none"}:${selectedWorkspaceSessionId ?? "none"}`;

	return <WorkspaceChatContent key={contentKey} />;
}

function WorkspaceChatContent() {
	const {
		selectedWorkspace,
		selectedWorkspaceSessionTab,
		selectedWorkspaceSummary,
		isNewWorkspaceDraft,
	} = useWorkspaces();
	const mockChat = useMockChat();
	const aiChat = useAIChat();
	const chat = USE_MOCK ? mockChat : aiChat;
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
		<ChatProvider value={chat}>
			<Conversation
				renderMessage={renderMessage}
				emptyState={
					<ConversationEmptyState
						title={
							isNewWorkspaceDraft
								? "New workspace"
								: (selectedWorkspaceSessionTab?.title ??
									selectedWorkspace?.title ??
									"Helmor")
						}
						description={
							isNewWorkspaceDraft
								? "Start with a prompt to create a workspace"
								: selectedWorkspace
									? selectedWorkspaceSummary.subtitle
									: "Select a workspace from the drawer"
						}
					/>
				}
			>
				<ConversationScrollButton />
				<PromptInput>
					<Link href="/attachments" asChild>
						<PromptInputAction>
							<Icon icon={Plus} className="h-5 w-5 text-muted-foreground" />
						</PromptInputAction>
					</Link>
					<PromptInputBody>
						<PromptInputTextarea placeholder="Chat with Helmor..." />
						<PromptInputSubmit />
					</PromptInputBody>
				</PromptInput>
			</Conversation>
		</ChatProvider>
	);
}
