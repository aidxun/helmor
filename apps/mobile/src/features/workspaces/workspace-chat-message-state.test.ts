import { describe, expect, test } from "bun:test";
import type { ThreadMessageLike } from "@helmor/thread-schema";
import { reconcileAuthoritativeThreadMessages } from "./workspace-chat-message-state";

function message(
	id: string,
	role: ThreadMessageLike["role"] = "assistant",
): ThreadMessageLike {
	return {
		id,
		role,
		content: [{ type: "text", text: id }],
	} as ThreadMessageLike;
}

describe("mobile workspace chat message state", () => {
	test("keeps optimistic messages when a stream update has an empty snapshot", () => {
		const previous = [
			message("mobile:123:user", "user"),
			message("mobile:123:assistant"),
		];

		expect(reconcileAuthoritativeThreadMessages(previous, [])).toBe(previous);
	});

	test("accepts an empty snapshot when the current thread is empty", () => {
		const incoming: ThreadMessageLike[] = [];

		expect(reconcileAuthoritativeThreadMessages([], incoming)).toBe(incoming);
	});

	test("replaces optimistic messages when the authoritative snapshot has content", () => {
		const previous = [message("mobile:123:assistant")];
		const incoming = [
			message("server-user", "user"),
			message("server-assistant"),
		];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual(
			incoming,
		);
	});

	test("keeps the existing prefix when the desktop returns a tail window", () => {
		const previous = [message("1"), message("2"), message("3")];
		const incoming = [message("5"), message("6"), message("7"), message("8")];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual([
			message("1"),
			message("2"),
			message("3"),
			message("5"),
			message("6"),
			message("7"),
			message("8"),
		]);
	});

	test("replaces the overlapping suffix with the authoritative tail", () => {
		const previous = [message("1"), message("2"), message("3")];
		const incoming = [message("3"), message("4")];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual([
			message("1"),
			message("2"),
			message("3"),
			message("4"),
		]);
	});

	test("drops mobile optimistic assistant rows before merging a server tail", () => {
		const previous = [message("1"), message("mobile:123:assistant")];
		const incoming = [message("2")];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual([
			message("1"),
			message("2"),
		]);
	});

	test("keeps an unmatched optimistic user before merging a server tail", () => {
		const previous = [message("1"), message("mobile:123:user", "user")];
		const incoming = [message("2")];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual([
			message("1"),
			message("mobile:123:user", "user"),
			message("2"),
		]);
	});

	test("keeps the optimistic first user message when a new chat tail only has the assistant reply", () => {
		const previous = [
			message("mobile:123:user", "user"),
			message("mobile:123:assistant"),
		];
		const incoming = [message("server-assistant")];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual([
			message("mobile:123:user", "user"),
			message("server-assistant"),
		]);
	});

	test("keeps the optimistic user before an overlapping assistant update", () => {
		const previous = [
			message("mobile:123:user", "user"),
			message("server-assistant"),
		];
		const incoming = [
			{
				...message("server-assistant"),
				content: [{ type: "text", id: "text-1", text: "updated assistant" }],
			} as ThreadMessageLike,
		];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual([
			message("mobile:123:user", "user"),
			incoming[0],
		]);
	});

	test("replaces the optimistic first user message once the server user row appears", () => {
		const previous = [
			message("mobile:123:user", "user"),
			message("mobile:123:assistant"),
		];
		const incoming = [
			{
				...message("server-user", "user"),
				content: [{ type: "text", id: "text-1", text: "mobile:123:user" }],
			} as ThreadMessageLike,
			message("server-assistant"),
		];

		expect(reconcileAuthoritativeThreadMessages(previous, incoming)).toEqual(
			incoming,
		);
	});
});
