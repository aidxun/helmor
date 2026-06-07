import { EnrichedChatMarkdown } from "./enriched-chat-markdown";

export function ChatMarkdown({ children }: { children: string }) {
	return <EnrichedChatMarkdown>{children}</EnrichedChatMarkdown>;
}
