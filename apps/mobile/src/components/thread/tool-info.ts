import type { ToolCallPart } from "@helmor/thread-schema";

export type MobileToolInfo = {
	action: string;
	detail?: string;
	file?: string;
	command?: string;
	fullCommand?: string;
	diffAdd?: number;
	diffDel?: number;
	files?: Array<{
		name: string;
		diffAdd?: number;
		diffDel?: number;
		rawDiff?: string;
	}>;
	body?: string;
	kind:
		| "file"
		| "edit"
		| "shell"
		| "search"
		| "web"
		| "agent"
		| "mcp"
		| "prompt"
		| "plan"
		| "generic";
};

export function getMobileToolInfo(part: ToolCallPart): MobileToolInfo {
	const { toolName: name, args } = part;
	if (name.startsWith("mcp__")) {
		const segments = name.split("__");
		const server = segments[1] ?? "mcp";
		const tool = segments.slice(2).join("__") || name;
		return { action: tool, detail: `via ${server}`, kind: "mcp" };
	}

	if (name === "Edit") {
		const filePath = str(args.file_path);
		const oldStr = typeof args.old_string === "string" ? args.old_string : "";
		const newStr = typeof args.new_string === "string" ? args.new_string : "";
		return {
			action: "Edit",
			file: filePath ? basename(filePath) : undefined,
			diffAdd: newStr ? newStr.split("\n").length : undefined,
			diffDel: oldStr ? oldStr.split("\n").length : undefined,
			kind: "edit",
		};
	}

	if (name === "apply_patch") {
		const changes = Array.isArray(args.changes) ? args.changes : [];
		const files = changes.filter(isObj).map((change) => {
			const path = str(change.path);
			const diff = typeof change.diff === "string" ? change.diff : "";
			const counts = diffCounts(diff);
			return {
				name: path ? basename(path) : "unknown",
				diffAdd: counts.add || undefined,
				diffDel: counts.del || undefined,
				rawDiff: diff || undefined,
			};
		});
		return {
			action: files.length > 1 ? `Edit ${files.length} files` : "Edit",
			file: files[0]?.name,
			files: files.length > 1 ? files : undefined,
			diffAdd: sum(files, "diffAdd"),
			diffDel: sum(files, "diffDel"),
			kind: "edit",
		};
	}

	if (name === "Read") {
		const filePath = str(args.file_path);
		const limit = typeof args.limit === "number" ? args.limit : null;
		return {
			action: limit ? `Read ${limit} lines` : "Read",
			file: filePath ? basename(filePath) : undefined,
			kind: "file",
		};
	}

	if (name === "Write") {
		const filePath = str(args.file_path);
		return {
			action: "Write",
			file: filePath ? basename(filePath) : undefined,
			kind: "file",
		};
	}

	if (name === "Bash") {
		const command = str(args.command);
		return {
			action: str(args.description) ?? "Run",
			command: command ? truncate(command, 96) : undefined,
			fullCommand: command ?? undefined,
			kind: "shell",
		};
	}

	if (name === "Grep" || name === "Glob" || name === "ToolSearch") {
		return {
			action: name,
			detail: truncate(str(args.pattern) ?? str(args.query) ?? "", 80),
			kind: "search",
		};
	}

	if (name === "WebFetch" || name === "WebSearch") {
		const action = isObj(args.action) ? args.action : null;
		const actionType = action ? str(action.type) : null;
		if (actionType === "openPage") {
			return {
				action: "Open page",
				detail: truncate(str(action!.url) ?? "", 80),
				kind: "web",
			};
		}
		if (actionType === "findInPage") {
			return {
				action: "Find in page",
				detail: truncate(str(action!.pattern) ?? str(action!.url) ?? "", 80),
				kind: "web",
			};
		}
		return {
			action: name,
			detail: truncate(str(args.url) ?? str(args.query) ?? "", 80),
			kind: "web",
		};
	}

	if (name === "Agent" || name === "Task") {
		const subagentType = str(args.subagent_type);
		const detail = str(args.description) ?? str(args.prompt);
		return {
			action: subagentType ?? name,
			detail: detail ? truncate(detail, 80) : undefined,
			kind: "agent",
		};
	}

	if (name === "Prompt") {
		return {
			action: "Prompt",
			body: str(args.text) ?? undefined,
			kind: "prompt",
		};
	}

	if (name === "Skill") {
		return {
			action: "Skill",
			detail: truncate(
				str(args.name) ??
					str(args.skill) ??
					str(args.command) ??
					str(args.id) ??
					"",
				80,
			),
			kind: "prompt",
		};
	}

	if (
		name === "AskUserQuestion" ||
		name === "askUserQuestions" ||
		name === "vscode_askQuestions"
	) {
		const questions = Array.isArray(args.questions) ? args.questions : [];
		const firstQuestion = questions[0];
		const detail =
			str(args.question) ??
			str(args.prompt) ??
			(isObj(firstQuestion)
				? (str(firstQuestion.question) ?? str(firstQuestion.header))
				: null);
		return {
			action: "Ask user",
			detail: detail ? truncate(detail, 80) : undefined,
			kind: "prompt",
		};
	}

	if (name === "EnterPlanMode")
		return { action: "Enter plan mode", kind: "plan" };
	if (name === "ExitPlanMode")
		return { action: "Exit plan mode", kind: "plan" };

	return { action: name, kind: "generic" };
}

export function previewValue(value: unknown, limit = 360): string | null {
	if (value == null) return null;
	const text =
		typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
	const trimmed = text.trim();
	if (!trimmed) return null;
	return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function diffCounts(diff: string): { add: number; del: number } {
	let add = 0;
	let del = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) add++;
		else if (line.startsWith("-") && !line.startsWith("---")) del++;
	}
	return { add, del };
}

function sum(
	files: Array<{ diffAdd?: number; diffDel?: number }>,
	key: "diffAdd" | "diffDel",
): number | undefined {
	const total = files.reduce((acc, file) => acc + (file[key] ?? 0), 0);
	return total || undefined;
}

function isObj(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function basename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	return normalized.split("/").filter(Boolean).pop() ?? normalized;
}

function truncate(value: string, max: number): string | undefined {
	if (!value) return undefined;
	return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
