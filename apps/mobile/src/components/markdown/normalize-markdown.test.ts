import { describe, expect, test } from "bun:test";
import { preserveMarkdownNewlines } from "./normalize-markdown";

describe("mobile markdown normalization", () => {
	test("keeps streamed single newlines visible outside fenced code", () => {
		expect(preserveMarkdownNewlines("第一行\n第二行")).toBe("第一行  \n第二行");
	});

	test("does not alter fenced code blocks inside ordered lists", () => {
		const markdown = [
			"1. **准备**",
			"   运行：",
			"",
			"   ```bash",
			"   npm run typecheck && npm test && npm run build",
			"   ```",
			"",
			"2. **继续**",
		].join("\n");

		const normalized = preserveMarkdownNewlines(markdown);

		expect(
			normalized.includes(
				"```bash\n   npm run typecheck && npm test && npm run build\n   ```",
			),
		).toBe(true);
		expect(normalized.includes("```bash  \n")).toBe(false);
		expect(normalized.includes("build  \n   ```")).toBe(false);
	});
});
