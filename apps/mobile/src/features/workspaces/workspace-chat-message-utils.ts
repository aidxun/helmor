import type { ThreadMessageLike } from "@helmor/thread-schema";
import type { ChatMessage } from "@/components/chat";

export function getTextFromParts(
	parts: Array<{ type: string; text?: string }>,
): string {
	return parts
		.filter((part) => part.type === "text" && part.text)
		.map((part) => part.text)
		.join("");
}

export function textThreadMessage({
	id,
	role,
	text,
	streaming,
}: {
	id: string;
	role: "user" | "assistant";
	text: string;
	streaming?: boolean;
}): ThreadMessageLike {
	return {
		id,
		role,
		streaming,
		content: [{ type: "text", id: `${id}:text`, text }],
	};
}

export function replaceLastAssistantText(
	messages: ThreadMessageLike[],
	text: string,
	streaming: boolean,
): ThreadMessageLike[] {
	const lastIndex = messages.length - 1;
	if (lastIndex < 0) return messages;
	const last = messages[lastIndex];
	if (!last || last.role !== "assistant") return messages;
	const next: ThreadMessageLike = {
		...last,
		streaming,
		content: last.content.map((part) =>
			part.type === "text" ? { ...part, text } : part,
		),
	};
	return [...messages.slice(0, lastIndex), next];
}

export function threadToChatMessage(message: ThreadMessageLike): ChatMessage {
	return {
		id: message.id ?? `${message.role}:${message.createdAt ?? ""}`,
		role: message.role === "user" ? "user" : "assistant",
		content: message.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join(""),
	};
}
