import {
	type ExtendedMessagePart,
	isCollapsedGroupPart,
	isFileMentionPart,
	isImagePart,
	isPlanReviewPart,
	isPromptSuggestionPart,
	isReasoningPart,
	isSystemNoticePart,
	isTextPart,
	isTodoListPart,
	isToolCallPart,
	partKey,
	type ReasoningPart,
	type TextPart,
	type ThreadMessageLike,
	type ToolCallPart,
} from "@helmor/thread-schema";
import { CircleAlert, Info, Lightbulb } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { ChatMarkdown } from "@/components/markdown";
import {
	ImageBlock,
	PlanReviewCard,
	PromptSuggestionButton,
	TodoListBlock,
} from "./structured-parts";
import {
	isSubagentSpawnPart,
	isSubagentToolName,
	SubAgentSpawnGroup,
	SubAgentToolCall,
} from "./subagent-row";
import { CollapsedToolGroup, ToolCallRow } from "./tool-call-row";

export function AssistantParts({
	message,
	onPromptSuggestion,
}: {
	message: ThreadMessageLike;
	onPromptSuggestion?: (text: string) => void;
}) {
	const parts = useMemo(
		() => groupAssistantParts(message.content),
		[message.content],
	);
	return (
		<>
			{parts.map((part) => {
				if (part.kind === "subagent-spawn-group") {
					return <SubAgentSpawnGroup key={part.key} parts={part.parts} />;
				}
				return (
					<AssistantPart
						key={partKey(part.part)}
						part={part.part}
						onPromptSuggestion={onPromptSuggestion}
					/>
				);
			})}
			{message.status && !message.streaming ? (
				<MessageStatusBadge status={message.status} />
			) : null}
		</>
	);
}

export function SystemNotice({
	part,
}: {
	part: Extract<ExtendedMessagePart, { type: "system-notice" }>;
}) {
	const isError = part.severity === "error";
	return (
		<View className="my-1 flex-row items-start gap-2 rounded-xl bg-muted/40 px-3 py-2">
			<Icon
				icon={isError ? CircleAlert : Info}
				className={
					isError ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"
				}
			/>
			<View className="min-w-0 flex-1">
				<Text className="text-sm font-medium text-foreground">
					{part.label}
				</Text>
				{part.body ? (
					<Text className="mt-0.5 text-sm leading-5 text-muted-foreground">
						{part.body}
					</Text>
				) : null}
			</View>
		</View>
	);
}

export function FileMentionChip({ path }: { path: string }) {
	return (
		<View className="self-start rounded-full border border-border/50 bg-muted/50 px-2.5 py-1">
			<Text className="text-xs text-muted-foreground" numberOfLines={1}>
				{path}
			</Text>
		</View>
	);
}

function AssistantPart({
	part,
	onPromptSuggestion,
}: {
	part: ExtendedMessagePart;
	onPromptSuggestion?: (text: string) => void;
}) {
	if (isTextPart(part)) return <AssistantText part={part} />;
	if (isReasoningPart(part)) return <ReasoningBlock part={part} />;
	if (isCollapsedGroupPart(part)) return <CollapsedToolGroup group={part} />;
	if (isToolCallPart(part)) {
		if (isSubagentToolName(part.toolName))
			return <SubAgentToolCall part={part} />;
		return <ToolCallRow part={part} />;
	}
	if (isTodoListPart(part)) return <TodoListBlock part={part} />;
	if (isImagePart(part)) return <ImageBlock part={part} />;
	if (isPromptSuggestionPart(part)) {
		return <PromptSuggestionButton part={part} onPress={onPromptSuggestion} />;
	}
	if (isFileMentionPart(part)) return <FileMentionChip path={part.path} />;
	if (isPlanReviewPart(part)) {
		return <PlanReviewCard part={part} onPrompt={onPromptSuggestion} />;
	}
	if (isSystemNoticePart(part)) return <SystemNotice part={part} />;
	return null;
}

function AssistantText({ part }: { part: TextPart }) {
	if (!part.text.trim()) return null;
	return <ChatMarkdown>{part.text}</ChatMarkdown>;
}

function ReasoningBlock({ part }: { part: ReasoningPart }) {
	const [open, setOpen] = useState(part.streaming === true);
	if (!part.text.trim()) return null;
	const duration =
		typeof part.durationMs === "number"
			? ` ${Math.round(part.durationMs / 1000)}s`
			: "";
	return (
		<View className="my-1 rounded-xl border border-border/60 bg-muted/30">
			<Pressable
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-2 px-3 py-2"
			>
				<Icon icon={Lightbulb} className="h-4 w-4 text-muted-foreground" />
				<Text className="flex-1 text-sm font-medium text-muted-foreground">
					Reasoning{duration}
				</Text>
				<Text className="text-xs text-muted-foreground/70">
					{open ? "Hide" : "Show"}
				</Text>
			</Pressable>
			{open ? (
				<Text
					selectable
					className="border-t border-border/50 px-3 py-2 text-sm leading-5 text-muted-foreground"
				>
					{part.text}
				</Text>
			) : null}
		</View>
	);
}

function MessageStatusBadge({
	status,
}: {
	status: NonNullable<ThreadMessageLike["status"]>;
}) {
	const label =
		status.type === "max_tokens"
			? "Stopped: max tokens"
			: status.type === "context_window_exceeded"
				? "Context window exceeded"
				: status.type === "refusal"
					? "Refused"
					: status.type === "pause_turn"
						? "Paused"
						: (status.reason ?? status.type);
	return (
		<View className="mt-2 self-start rounded-full bg-muted/50 px-2.5 py-1">
			<Text className="text-xs text-muted-foreground">{label}</Text>
		</View>
	);
}

type GroupedAssistantPart =
	| { kind: "part"; part: ExtendedMessagePart }
	| { kind: "subagent-spawn-group"; key: string; parts: ToolCallPart[] };

function groupAssistantParts(
	parts: ExtendedMessagePart[],
): GroupedAssistantPart[] {
	const grouped: GroupedAssistantPart[] = [];
	let pendingSpawns: ToolCallPart[] = [];

	const flushSpawns = () => {
		if (!pendingSpawns.length) return;
		grouped.push({
			kind: "subagent-spawn-group",
			key: `subagent-spawn:${pendingSpawns[0]!.toolCallId}`,
			parts: pendingSpawns,
		});
		pendingSpawns = [];
	};

	for (const part of parts) {
		if (isToolCallPart(part) && isSubagentSpawnPart(part)) {
			pendingSpawns.push(part);
			continue;
		}
		flushSpawns();
		grouped.push({ kind: "part", part });
	}
	flushSpawns();
	return grouped;
}
