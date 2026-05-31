import type { ThreadMessageLike } from "@helmor/thread-schema";
import type { Dispatch, SetStateAction } from "react";
import type { StreamingStore } from "@/components/chat";
import type { CompanionStreamEvent } from "@/lib/remote";
import { reconcileAuthoritativeThreadMessages } from "./workspace-chat-message-state";
import { getTextFromParts } from "./workspace-chat-message-utils";

export function applyCompanionStreamEvent({
	event,
	setThreadMessages,
	streamingStore,
	setError,
	setIsGenerating,
}: {
	event: CompanionStreamEvent;
	setThreadMessages: Dispatch<SetStateAction<ThreadMessageLike[]>>;
	streamingStore: StreamingStore;
	setError: (error: Error | null) => void;
	setIsGenerating: (isGenerating: boolean) => void;
}) {
	if (event.kind === "started") return;
	if (event.kind === "error") {
		setError(new Error(event.message));
		setIsGenerating(false);
		return;
	}
	const agentEvent = event.event;
	if (agentEvent.kind === "update") {
		const messages = agentEvent.messages as ThreadMessageLike[];
		setThreadMessages((previous) =>
			reconcileAuthoritativeThreadMessages(previous, messages),
		);
		if (messages.length === 0) return;
		const last = messages[messages.length - 1];
		streamingStore.set(last?.streaming ? messageText(last) : "");
		return;
	}
	if (agentEvent.kind === "streamingPartial") {
		const message = agentEvent.message as ThreadMessageLike;
		setThreadMessages((previous) => upsertStreamingPartial(previous, message));
		streamingStore.set(messageText(message));
		return;
	}
	if (agentEvent.kind === "done" || agentEvent.kind === "aborted") {
		setIsGenerating(false);
		streamingStore.set("");
		return;
	}
	if (agentEvent.kind === "error") {
		setError(new Error(String(agentEvent.message ?? "Stream failed")));
		setIsGenerating(false);
		streamingStore.set("");
	}
}

function upsertStreamingPartial(
	messages: ThreadMessageLike[],
	partial: ThreadMessageLike,
): ThreadMessageLike[] {
	const index = messages.findIndex((message) => message.id === partial.id);
	if (index >= 0) {
		return [...messages.slice(0, index), partial, ...messages.slice(index + 1)];
	}
	const last = messages[messages.length - 1];
	if (last?.role === "assistant" && last.streaming) {
		return [...messages.slice(0, -1), partial];
	}
	return [...messages, partial];
}

function messageText(message: ThreadMessageLike): string {
	return getTextFromParts(
		message.content as Array<{ type: string; text?: string }>,
	);
}
