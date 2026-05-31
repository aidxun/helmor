import {
	extractPlainText,
	type ThreadMessageLike,
} from "@helmor/thread-schema";

export function reconcileAuthoritativeThreadMessages(
	previous: ThreadMessageLike[],
	incoming: ThreadMessageLike[],
): ThreadMessageLike[] {
	if (incoming.length === 0 && previous.length > 0) return previous;
	if (previous.length === 0) return incoming;

	const optimisticUsers = previous
		.map((message, index) => ({ message, index }))
		.filter(({ message }) => isOptimisticMobileUserMessage(message))
		.filter(
			({ message }) =>
				!incoming.some((candidate) => sameUserMessage(candidate, message)),
		);
	const previousWithoutOptimistic = previous
		.map((message, index) => ({ message, index }))
		.filter(({ message }) => !isOptimisticMobileMessage(message));
	const previousCarry = previous
		.map((message, index) => ({ message, index }))
		.filter(
			({ message, index }) =>
				!isOptimisticMobileMessage(message) ||
				optimisticUsers.some((optimistic) => optimistic.index === index),
		);
	if (previousWithoutOptimistic.length === 0)
		return [...optimisticUsers.map(({ message }) => message), ...incoming];

	const previousKeyIndex = new Map<
		string,
		{ filteredIndex: number; originalIndex: number }
	>();
	for (let index = 0; index < previousWithoutOptimistic.length; index += 1) {
		const item = previousWithoutOptimistic[index]!;
		const key = stableMessageKey(item.message);
		if (key) {
			previousKeyIndex.set(key, {
				filteredIndex: index,
				originalIndex: item.index,
			});
		}
	}

	for (
		let incomingIndex = 0;
		incomingIndex < incoming.length;
		incomingIndex += 1
	) {
		const key = stableMessageKey(incoming[incomingIndex]!);
		if (!key) continue;
		const previousMatch = previousKeyIndex.get(key);
		if (previousMatch == null) continue;
		const prefix = mergeMessagePrefixes(
			previousCarry
				.filter(({ index }) => index < previousMatch.originalIndex)
				.map(({ message }) => message),
			incoming.slice(0, incomingIndex),
		);
		if (optimisticUsers.length === 0) {
			return [...prefix, ...incoming.slice(incomingIndex)];
		}
		const optimisticBefore = optimisticUsers
			.filter(({ index }) => index < previousMatch.originalIndex)
			.map(({ message }) => message);
		const optimisticAfter = optimisticUsers
			.filter(({ index }) => index >= previousMatch.originalIndex)
			.map(({ message }) => message);
		return [
			...mergeMessagePrefixes(prefix, optimisticBefore),
			...incoming.slice(incomingIndex, incomingIndex + 1),
			...optimisticAfter,
			...incoming.slice(incomingIndex + 1),
		];
	}

	return [...previousCarry.map(({ message }) => message), ...incoming];
}

function mergeMessagePrefixes(
	left: ThreadMessageLike[],
	right: ThreadMessageLike[],
): ThreadMessageLike[] {
	const merged = [...left];
	for (const message of right) {
		if (merged.some((existing) => sameMessage(existing, message))) continue;
		merged.push(message);
	}
	return merged;
}

function isOptimisticMobileUserMessage(message: ThreadMessageLike): boolean {
	return isOptimisticMobileMessage(message) && message.role === "user";
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

function isOptimisticMobileMessage(message: ThreadMessageLike): boolean {
	return typeof message.id === "string" && message.id.startsWith("mobile:");
}

function sameMessage(
	left: ThreadMessageLike,
	right: ThreadMessageLike,
): boolean {
	const leftKey = stableMessageKey(left);
	const rightKey = stableMessageKey(right);
	if (leftKey && rightKey) return leftKey === rightKey;
	return sameUserMessage(left, right);
}
