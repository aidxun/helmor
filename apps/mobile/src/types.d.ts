declare module "*.css";

declare module "bun:test" {
	type TestCallback = () => void | Promise<void>;

	type Matchers = {
		toBe: (expected: unknown) => void;
		toEqual: (expected: unknown) => void;
	};

	export function describe(name: string, callback: TestCallback): void;
	export function expect(actual: unknown): Matchers;
	export function test(name: string, callback: TestCallback): void;
}
