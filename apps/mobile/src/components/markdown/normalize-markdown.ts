/**
 * Convert single newlines to hard breaks so streamed text keeps its visible
 * shape. Fenced code blocks are left untouched so the parser can still
 * recognize them as block code.
 */
export function preserveMarkdownNewlines(markdown: string): string {
	return markdown.replace(/(```[\s\S]*?```)|(\n)/g, (match, codeBlock) =>
		codeBlock ? match : "  \n",
	);
}
