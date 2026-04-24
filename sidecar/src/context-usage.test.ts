import { describe, expect, it } from "bun:test";
import {
	buildClaudeRichMeta,
	buildClaudeStoredMeta,
	buildCodexStoredMeta,
} from "./context-usage";

describe("buildClaudeStoredMeta", () => {
	it("derives used/max/percentage from usage when iterations is absent", () => {
		const meta = buildClaudeStoredMeta({
			type: "result",
			usage: {
				input_tokens: 6,
				cache_creation_input_tokens: 12_267,
				cache_read_input_tokens: 13_101,
				output_tokens: 10,
			},
			modelUsage: {
				"claude-opus-4-7[1m]": { contextWindow: 1_000_000 },
			},
		});
		expect(meta).toEqual({
			usedTokens: 25_384,
			maxTokens: 1_000_000,
			percentage: 2.54,
		});
	});

	it("prefers last message iteration over cumulative usage", () => {
		// Real-shape payload lifted from a session where `usage` summed
		// to ~1.1M (42 iterations, cache_read accumulated) but the actual
		// end-of-turn context was only ~78k.
		const meta = buildClaudeStoredMeta({
			type: "result",
			usage: {
				input_tokens: 340,
				cache_creation_input_tokens: 75_098,
				cache_read_input_tokens: 1_008_704,
				output_tokens: 18_132,
			},
			iterations: [
				{
					type: "message",
					input_tokens: 1,
					cache_creation_input_tokens: 2_468,
					cache_read_input_tokens: 72_630,
					output_tokens: 3_056,
				},
			],
			modelUsage: {
				"claude-opus-4-7[1m]": { contextWindow: 1_000_000 },
			},
		});
		expect(meta).toEqual({
			usedTokens: 78_155,
			maxTokens: 1_000_000,
			percentage: 7.82,
		});
	});

	it("uses the LAST entry when iterations has multiple message entries", () => {
		const meta = buildClaudeStoredMeta({
			usage: { input_tokens: 999_999 },
			iterations: [
				{ type: "message", input_tokens: 10_000, output_tokens: 0 },
				{ type: "message", input_tokens: 20_000, output_tokens: 0 },
				{ type: "message", input_tokens: 42_000, output_tokens: 0 },
			],
			modelUsage: { foo: { contextWindow: 1_000_000 } },
		});
		expect(meta?.usedTokens).toBe(42_000);
	});

	it("skips a trailing compaction iteration to find the last message", () => {
		const meta = buildClaudeStoredMeta({
			usage: { input_tokens: 999_999 },
			iterations: [
				{ type: "message", input_tokens: 50_000, output_tokens: 0 },
				{ type: "compaction", input_tokens: 8_000 },
			],
			modelUsage: { foo: { contextWindow: 1_000_000 } },
		});
		expect(meta?.usedTokens).toBe(50_000);
	});

	it("falls back to usage when iterations is an empty array", () => {
		const meta = buildClaudeStoredMeta({
			usage: { input_tokens: 5_000, output_tokens: 100 },
			iterations: [],
			modelUsage: { foo: { contextWindow: 200_000 } },
		});
		expect(meta?.usedTokens).toBe(5_100);
	});

	it("picks the largest contextWindow across multiple modelUsage entries", () => {
		const meta = buildClaudeStoredMeta({
			usage: { input_tokens: 100, output_tokens: 50 },
			modelUsage: {
				"haiku-4-5": { contextWindow: 200_000 },
				"claude-opus-4-7[1m]": { contextWindow: 1_000_000 },
			},
		});
		expect(meta?.maxTokens).toBe(1_000_000);
	});

	it("clamps used at maxTokens when sum exceeds the window", () => {
		const meta = buildClaudeStoredMeta({
			usage: { input_tokens: 1_200_000, output_tokens: 0 },
			modelUsage: { foo: { contextWindow: 1_000_000 } },
		});
		expect(meta?.usedTokens).toBe(1_000_000);
		expect(meta?.percentage).toBe(100);
	});

	it("returns null when usage is missing", () => {
		expect(buildClaudeStoredMeta({ modelUsage: {} })).toBeNull();
	});

	it("returns null when modelUsage is missing", () => {
		expect(
			buildClaudeStoredMeta({ usage: { input_tokens: 10, output_tokens: 1 } }),
		).toBeNull();
	});

	it("returns null on an empty turn (zero tokens)", () => {
		expect(
			buildClaudeStoredMeta({
				usage: { input_tokens: 0, output_tokens: 0 },
				modelUsage: { foo: { contextWindow: 1_000_000 } },
			}),
		).toBeNull();
	});

	it("accepts error-result turns (same usage/modelUsage shape)", () => {
		// SDKResultError has the same usage/modelUsage fields as
		// SDKResultSuccess — so error turns get their usage persisted too.
		const meta = buildClaudeStoredMeta({
			type: "result",
			subtype: "error_max_turns",
			is_error: true,
			usage: { input_tokens: 5000, output_tokens: 100 },
			modelUsage: { "claude-sonnet-4-5": { contextWindow: 200_000 } },
		});
		expect(meta).toEqual({
			usedTokens: 5100,
			maxTokens: 200_000,
			percentage: 2.55,
		});
	});
});

describe("buildClaudeRichMeta", () => {
	it("maps SDK response to the rich shape, drops Free space + color", () => {
		const rich = buildClaudeRichMeta({
			totalTokens: 1500,
			maxTokens: 200_000,
			percentage: 0.75,
			isAutoCompactEnabled: true,
			categories: [
				{ name: "Messages", tokens: 800, color: "#f00" },
				{ name: "System tools", tokens: 700, color: "#0f0" },
				{ name: "Free space", tokens: 198_500, color: "#fff" },
			],
		});
		expect(rich).toEqual({
			usedTokens: 1500,
			maxTokens: 200_000,
			percentage: 0.75,
			isAutoCompactEnabled: true,
			categories: [
				{ name: "Messages", tokens: 800 },
				{ name: "System tools", tokens: 700 },
			],
		});
	});

	it("tolerates a missing categories array", () => {
		const rich = buildClaudeRichMeta({
			totalTokens: 100,
			maxTokens: 1000,
			percentage: 10,
		});
		expect(rich.categories).toEqual([]);
		expect(rich.isAutoCompactEnabled).toBe(false);
	});
});

describe("buildCodexStoredMeta", () => {
	it("uses last.totalTokens as the numerator (not total.totalTokens)", () => {
		const meta = buildCodexStoredMeta({
			modelContextWindow: 400_000,
			last: { totalTokens: 12_000 },
			total: { totalTokens: 50_000 },
		});
		expect(meta).toEqual({
			usedTokens: 12_000,
			maxTokens: 400_000,
			percentage: 3,
		});
	});

	it("falls back to total.totalTokens when last is absent", () => {
		const meta = buildCodexStoredMeta({
			modelContextWindow: 400_000,
			total: { totalTokens: 8000 },
		});
		expect(meta?.usedTokens).toBe(8000);
	});

	it("clamps used at maxTokens when it exceeds the window", () => {
		const meta = buildCodexStoredMeta({
			modelContextWindow: 200_000,
			last: { totalTokens: 250_000 },
		});
		expect(meta?.usedTokens).toBe(200_000);
		expect(meta?.percentage).toBe(100);
	});

	it("returns null when there is nothing meaningful to persist", () => {
		expect(buildCodexStoredMeta({ last: { totalTokens: 0 } })).toBeNull();
	});
});
