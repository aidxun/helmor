export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

export type ChatComposerSubmit = {
	prompt: string;
	modelId?: string | null;
	effortLevel?: string | null;
	permissionMode?: string | null;
	fastMode?: boolean | null;
};
