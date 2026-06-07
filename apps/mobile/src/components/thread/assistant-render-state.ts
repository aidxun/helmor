import type {
	ExtendedMessagePart,
	ThreadMessageLike,
} from "@helmor/thread-schema";

export function hasRenderableAssistantContent(
	parts: ExtendedMessagePart[],
): boolean {
	return parts.some((part) => {
		if (part.type === "text" || part.type === "reasoning") {
			return part.text.trim().length > 0;
		}
		return true;
	});
}

export function shouldShowAssistantStatusBadge(
	status: ThreadMessageLike["status"],
): status is NonNullable<ThreadMessageLike["status"]> {
	if (!status) return false;
	return !(status.type === "complete" && status.reason === "stop");
}
