import { describe, expect, test } from "bun:test";
import { safeJsonParse } from "./json";

describe("mobile local cache JSON helpers", () => {
	test("parses valid JSON", () => {
		expect(safeJsonParse<{ value: string }>('{"value":"ok"}')).toEqual({
			value: "ok",
		});
	});

	test("returns null for invalid or missing JSON", () => {
		expect(safeJsonParse("{")).toBe(null);
		expect(safeJsonParse(null)).toBe(null);
		expect(safeJsonParse(undefined)).toBe(null);
	});
});
