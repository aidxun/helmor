import { describe, expect, test } from "bun:test";
import type {
	ExtendedMessagePart,
	ThreadMessageLike,
} from "@helmor/thread-schema";
import {
	hasRenderableAssistantContent,
	shouldShowAssistantStatusBadge,
} from "./assistant-render-state";

describe("mobile assistant render state", () => {
	test("hides the normal complete stop status badge", () => {
		expect(
			shouldShowAssistantStatusBadge({
				type: "complete",
				reason: "stop",
			}),
		).toBe(false);
	});

	test("keeps non-default assistant status badges visible", () => {
		const statuses: ThreadMessageLike["status"][] = [
			{ type: "max_tokens" },
			{ type: "complete", reason: "length" },
			{ type: "incomplete", reason: "tool_error" },
		];

		expect(statuses.map(shouldShowAssistantStatusBadge)).toEqual([
			true,
			true,
			true,
		]);
	});

	test("treats empty text streaming rows as loading-only", () => {
		expect(
			hasRenderableAssistantContent([
				{ type: "text", id: "text-1", text: "" },
			] as ExtendedMessagePart[]),
		).toBe(false);
	});

	test("detects assistant content once text arrives", () => {
		expect(
			hasRenderableAssistantContent([
				{ type: "text", id: "text-1", text: "Hello" },
			] as ExtendedMessagePart[]),
		).toBe(true);
	});
});
