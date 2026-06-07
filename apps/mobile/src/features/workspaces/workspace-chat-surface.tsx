import {
	type ThreadMessageLike,
	threadMessageKey,
} from "@helmor/thread-schema";
import { Link } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useEffect } from "react";
import { View } from "react-native";
import {
	ChatProvider,
	Conversation,
	ConversationEmptyState,
	ConversationScrollButton,
	PromptInput,
	PromptInputAction,
	PromptInputBody,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/chat";
import { Icon } from "@/components/icon";
import { ThreadMessageRow } from "@/components/thread";
import { useAIChatState, useMockChatState } from "./workspace-chat-dev-hooks";
import {
	type ThreadChatState,
	useDesktopThreadChat,
	useWorkspaceFallbackSession,
} from "./workspace-chat-hooks";
import { useWorkspaces } from "./workspace-context";
import { useNewWorkspaceThreadChat } from "./workspace-new-chat-hooks";
import { NewChatStartPage } from "./workspace-new-task-controls";

const USE_MOCK = process.env.EXPO_PUBLIC_MOCK_AI !== "0";

export function WorkspaceChatSurface({
	onScrolledFromTopChange,
}: {
	onScrolledFromTopChange?: (scrolled: boolean) => void;
}) {
	const {
		newWorkspaceDraftKey,
		selectedWorkspace,
		selectedWorkspaceSessionId,
	} = useWorkspaces();
	const contentKey =
		newWorkspaceDraftKey ??
		`${selectedWorkspace?.id ?? "none"}:${selectedWorkspaceSessionId ?? "none"}`;

	useEffect(() => {
		onScrolledFromTopChange?.(false);
	}, [contentKey, onScrolledFromTopChange]);

	return (
		<WorkspaceChatContent
			key={contentKey}
			onScrolledFromTopChange={onScrolledFromTopChange}
		/>
	);
}

function WorkspaceChatContent({
	onScrolledFromTopChange,
}: {
	onScrolledFromTopChange?: (scrolled: boolean) => void;
}) {
	const {
		activeDesktop,
		selectedWorkspace,
		selectedWorkspaceSessionId,
		selectedWorkspaceSessionTab,
		selectedWorkspaceSummary,
		isNewWorkspaceDraft,
		newWorkspaceTarget,
		repositories,
		setNewWorkspaceTarget,
		selectCreatedWorkspace,
		refreshWorkspaces,
		threadRefreshVersion,
	} = useWorkspaces();
	const needsFallbackSession = Boolean(
		activeDesktop &&
			selectedWorkspace &&
			!selectedWorkspaceSessionId &&
			!isNewWorkspaceDraft,
	);
	const fallbackSession = useWorkspaceFallbackSession({
		activeDesktop,
		workspaceId: selectedWorkspace?.id ?? null,
		enabled: needsFallbackSession,
	});
	const effectiveSessionId =
		selectedWorkspaceSessionId ?? fallbackSession.sessionId;
	const hasDesktopWorkspace = Boolean(
		activeDesktop && selectedWorkspace && !isNewWorkspaceDraft,
	);
	const desktopChat = useDesktopThreadChat({
		activeDesktop,
		sessionId: effectiveSessionId,
		refreshVersion: threadRefreshVersion,
		enabled: Boolean(
			activeDesktop && effectiveSessionId && !isNewWorkspaceDraft,
		),
	});
	const handleNewWorkspaceCompleted = useCallback(
		async (workspaceId: string, sessionId: string) => {
			await refreshWorkspaces();
			selectCreatedWorkspace(workspaceId, sessionId);
		},
		[refreshWorkspaces, selectCreatedWorkspace],
	);
	const handleNewWorkspaceStarted = useCallback(() => {
		void refreshWorkspaces();
	}, [refreshWorkspaces]);
	const newWorkspaceChat = useNewWorkspaceThreadChat({
		activeDesktop,
		target: newWorkspaceTarget,
		enabled: Boolean(activeDesktop && isNewWorkspaceDraft),
		onStarted: handleNewWorkspaceStarted,
		onCompleted: handleNewWorkspaceCompleted,
	});
	const mockChat = useMockChatState();
	const aiChat = useAIChatState();
	const chat = selectChatState({
		desktopChat,
		newWorkspaceChat,
		mockChat,
		aiChat,
		hasDesktopWorkspace,
		isNewWorkspaceDraft,
	});
	const chatLoading = fallbackSession.loading || chat.loading;

	const renderMessage = useCallback(
		({ item }: { item: unknown; index: number }) => {
			return (
				<ThreadMessageRow
					message={item as ThreadMessageLike}
					onPromptSuggestion={chat.setInput}
				/>
			);
		},
		[chat.setInput],
	);

	return (
		<ChatProvider value={chat}>
			<Conversation
				items={chat.threadMessages}
				renderMessage={renderMessage}
				keyExtractor={(item, index) =>
					threadMessageKey(item as ThreadMessageLike, index)
				}
				estimatedItemSize={128}
				onScrolledFromTopChange={onScrolledFromTopChange}
				emptyState={
					isNewWorkspaceDraft ? (
						<NewChatStartPage
							repositories={repositories}
							target={newWorkspaceTarget}
							onChangeTarget={setNewWorkspaceTarget}
						/>
					) : (
						<View className="w-full items-center justify-center gap-6">
							<ConversationEmptyState
								title={
									chatLoading
										? "Loading session"
										: (selectedWorkspaceSessionTab?.title ??
											selectedWorkspace?.title ??
											"Helmor")
								}
								description={
									chatLoading
										? "Fetching messages from your desktop."
										: selectedWorkspace
											? selectedWorkspaceSummary.subtitle
											: "Select a workspace from the drawer"
								}
							/>
						</View>
					)
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

function selectChatState({
	desktopChat,
	newWorkspaceChat,
	mockChat,
	aiChat,
	hasDesktopWorkspace,
	isNewWorkspaceDraft,
}: {
	desktopChat: ThreadChatState;
	newWorkspaceChat: ThreadChatState;
	mockChat: ThreadChatState;
	aiChat: ThreadChatState;
	hasDesktopWorkspace: boolean;
	isNewWorkspaceDraft: boolean;
}): ThreadChatState {
	if (isNewWorkspaceDraft) return newWorkspaceChat;
	if (hasDesktopWorkspace) return desktopChat;
	return USE_MOCK ? mockChat : aiChat;
}
