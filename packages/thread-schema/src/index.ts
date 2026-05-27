export type StreamingStatus =
	| "pending"
	| "streaming_input"
	| "running"
	| "done"
	| "error";

export type TextPart = { type: "text"; id: string; text: string };

export type ReasoningPart = {
	type: "reasoning";
	id: string;
	text: string;
	streaming?: boolean;
	durationMs?: number;
};

export type ToolCallPart = {
	type: "tool-call";
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	argsText: string;
	result?: unknown;
	isError?: boolean;
	streamingStatus?: StreamingStatus;
	children?: ExtendedMessagePart[];
};

export type NoticeSeverity = "info" | "warning" | "error";

export type SystemNoticePart = {
	type: "system-notice";
	id: string;
	severity: NoticeSeverity;
	label: string;
	body?: string;
};

export type TodoStatus = "pending" | "in_progress" | "completed";
export type TodoItem = { text: string; status: TodoStatus };

export type TodoListPart = {
	type: "todo-list";
	id: string;
	items: TodoItem[];
};

export type ImageSource =
	| { kind: "base64"; data: string }
	| { kind: "url"; url: string }
	| { kind: "file"; path: string };

export type ImagePart = {
	type: "image";
	id: string;
	source: ImageSource;
	mediaType?: string;
};

export type PromptSuggestionPart = {
	type: "prompt-suggestion";
	id: string;
	text: string;
};

export type FileMentionPart = {
	type: "file-mention";
	id: string;
	path: string;
};

export type PlanReviewAllowedPrompt = {
	tool: string;
	prompt: string;
};

export type PlanReviewPart = {
	type: "plan-review";
	toolUseId: string;
	toolName: string;
	plan?: string | null;
	planFilePath?: string | null;
	allowedPrompts?: PlanReviewAllowedPrompt[];
};

export type MessagePart =
	| TextPart
	| ReasoningPart
	| ToolCallPart
	| SystemNoticePart
	| TodoListPart
	| ImagePart
	| PromptSuggestionPart
	| FileMentionPart
	| PlanReviewPart;

export type CollapsedGroupPart = {
	type: "collapsed-group";
	id: string;
	category: "search" | "read" | "shell" | "mixed";
	tools: ToolCallPart[];
	active: boolean;
	summary: string;
};

export type ExtendedMessagePart = MessagePart | CollapsedGroupPart;

export type MessageRole = "assistant" | "system" | "user" | "error";

export type ThreadMessageLike = {
	role: MessageRole;
	id?: string;
	createdAt?: string;
	content: ExtendedMessagePart[];
	status?: { type: string; reason?: string };
	streaming?: boolean;
};

export type AgentProvider = "claude" | "codex";

export type AgentStreamEvent =
	| {
			kind: "update";
			messages: ThreadMessageLike[];
	  }
	| {
			kind: "streamingPartial";
			message: ThreadMessageLike;
	  }
	| {
			kind: "done";
			provider: AgentProvider;
			modelId: string;
			resolvedModel: string;
			sessionId?: string | null;
			workingDirectory: string;
			persisted: boolean;
	  }
	| {
			kind: "aborted";
			provider: AgentProvider;
			modelId: string;
			resolvedModel: string;
			sessionId?: string | null;
			workingDirectory: string;
			persisted: boolean;
			reason: string;
	  }
	| {
			kind: "permissionRequest";
			permissionId: string;
			toolName: string;
			toolInput: Record<string, unknown>;
			title?: string | null;
			description?: string | null;
	  }
	| {
			kind: "userInputRequest";
			requestId: string;
			prompt: string;
			title?: string | null;
			description?: string | null;
	  }
	| {
			kind: "planCaptured";
			plan: ThreadMessageLike;
	  }
	| {
			kind: "error";
			message: string;
	  };

export const DEFAULT_SESSION_THREAD_TAIL_LIMIT = 200;

export function partKey(part: ExtendedMessagePart): string {
	if (part.type === "tool-call") return part.toolCallId;
	if (part.type === "plan-review") return part.toolUseId;
	return part.id;
}

export function isTextPart(part: ExtendedMessagePart): part is TextPart {
	return part.type === "text";
}

export function isReasoningPart(
	part: ExtendedMessagePart,
): part is ReasoningPart {
	return part.type === "reasoning";
}

export function isToolCallPart(
	part: ExtendedMessagePart,
): part is ToolCallPart {
	return part.type === "tool-call";
}

export function isCollapsedGroupPart(
	part: ExtendedMessagePart,
): part is CollapsedGroupPart {
	return part.type === "collapsed-group";
}

export function isSystemNoticePart(
	part: ExtendedMessagePart,
): part is SystemNoticePart {
	return part.type === "system-notice";
}

export function isTodoListPart(
	part: ExtendedMessagePart,
): part is TodoListPart {
	return part.type === "todo-list";
}

export function isImagePart(part: ExtendedMessagePart): part is ImagePart {
	return part.type === "image";
}

export function isPromptSuggestionPart(
	part: ExtendedMessagePart,
): part is PromptSuggestionPart {
	return part.type === "prompt-suggestion";
}

export function isFileMentionPart(
	part: ExtendedMessagePart,
): part is FileMentionPart {
	return part.type === "file-mention";
}

export function isPlanReviewPart(
	part: ExtendedMessagePart,
): part is PlanReviewPart {
	return part.type === "plan-review";
}

export function threadMessageKey(
	message: ThreadMessageLike,
	index: number,
): string {
	return message.id ?? `${message.role}:${message.createdAt ?? index}`;
}

export function extractPlainText(
	parts: readonly ExtendedMessagePart[],
): string {
	return parts
		.filter(isTextPart)
		.map((part) => part.text)
		.join("");
}
