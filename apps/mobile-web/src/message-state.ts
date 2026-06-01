import {
	extractPlainText,
	type ThreadMessageLike,
} from "@helmor/thread-schema";

export function textThreadMessage({
	id,
	role,
	text,
	streaming,
}: {
	id: string;
	role: "assistant" | "user";
	text: string;
	streaming?: boolean;
}): ThreadMessageLike {
	return {
		id,
		role,
		streaming,
		createdAt: new Date().toISOString(),
		content: [{ type: "text", id: `${id}:text`, text }],
	};
}

export function reconcileThreadMessages(
	previous: ThreadMessageLike[],
	incoming: ThreadMessageLike[],
): ThreadMessageLike[] {
	if (incoming.length === 0 && previous.length > 0) return previous;
	if (previous.length === 0) return incoming;

	const optimisticUsers = previous.filter(
		(message) =>
			isOptimisticMobileMessage(message) &&
			message.role === "user" &&
			!incoming.some((candidate) => sameUserMessage(candidate, message)),
	);
	const withoutOptimistic = previous.filter(
		(message) => !isOptimisticMobileMessage(message),
	);
	if (withoutOptimistic.length === 0) return [...optimisticUsers, ...incoming];

	for (
		let incomingIndex = 0;
		incomingIndex < incoming.length;
		incomingIndex += 1
	) {
		const incomingKey = stableMessageKey(incoming[incomingIndex]!);
		if (!incomingKey) continue;
		const previousIndex = withoutOptimistic.findIndex(
			(message) => stableMessageKey(message) === incomingKey,
		);
		if (previousIndex >= 0) {
			return [...optimisticUsers, ...incoming.slice(incomingIndex)];
		}
	}

	return [...withoutOptimistic, ...optimisticUsers, ...incoming];
}

export function upsertStreamingPartial(
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

function isOptimisticMobileMessage(message: ThreadMessageLike): boolean {
	return typeof message.id === "string" && message.id.startsWith("mobile:");
}

function sameUserMessage(
	left: ThreadMessageLike,
	right: ThreadMessageLike,
): boolean {
	return (
		left.role === "user" &&
		right.role === "user" &&
		extractPlainText(left.content).trim() ===
			extractPlainText(right.content).trim()
	);
}

function stableMessageKey(message: ThreadMessageLike): string | null {
	if (message.id) return `id:${message.id}`;
	if (message.createdAt) return `${message.role}:${message.createdAt}`;
	return null;
}
