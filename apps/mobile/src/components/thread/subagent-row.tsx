import type { ToolCallPart } from "@helmor/thread-schema";
import {
	Bot,
	Check,
	CircleAlert,
	LoaderCircle,
	Sparkles,
} from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";

type AgentState = {
	threadId: string;
	nickname: string | null;
	role: string | null;
	status: string | null;
	message: string | null;
};

export function isSubagentToolName(toolName: string): boolean {
	return toolName.startsWith("subagent_");
}

export function isSubagentSpawnPart(part: ToolCallPart): boolean {
	return part.toolName === "subagent_spawn";
}

export const SubAgentSpawnGroup = memo(function SubAgentSpawnGroup({
	parts,
}: {
	parts: ToolCallPart[];
}) {
	const live = parts.some((part) =>
		isLiveStatus(String(part.args.status ?? "")),
	);
	const [open, setOpen] = useState(live || parts.length === 1);

	if (parts.length === 0) return null;
	if (parts.length === 1) return <SpawnAgentRow part={parts[0]!} />;

	return (
		<View className="my-1">
			<Pressable
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-1.5 py-1"
			>
				<Icon icon={Sparkles} className="h-3.5 w-3.5 text-muted-foreground" />
				<Text className="text-sm font-medium text-muted-foreground">
					Spawned {parts.length} agents
				</Text>
				<Text className="text-xs text-muted-foreground/60">
					{open ? "Hide" : "Show"}
				</Text>
			</Pressable>
			{open ? (
				<View className="ml-1 border-l border-border/50 pl-3">
					{parts.map((part) => (
						<SpawnAgentRow key={part.toolCallId} part={part} nested />
					))}
				</View>
			) : null}
		</View>
	);
});

export const SubAgentToolCall = memo(function SubAgentToolCall({
	part,
}: {
	part: ToolCallPart;
}) {
	switch (part.toolName) {
		case "subagent_spawn":
			return <SubAgentSpawnGroup parts={[part]} />;
		case "subagent_wait":
			return <SubAgentWaitRow part={part} />;
		case "subagent_send_input":
		case "subagent_resume":
		case "subagent_close":
			return <SubAgentMiscRow part={part} />;
		default:
			return null;
	}
});

function SpawnAgentRow({
	part,
	nested = false,
}: {
	part: ToolCallPart;
	nested?: boolean;
}) {
	const states = useMemo(() => readAgentStates(part.args), [part.args]);
	const [open, setOpen] = useState(false);
	const target = states[0];
	const label = target?.nickname ?? "Sub-agent";
	const prompt = typeof part.args.prompt === "string" ? part.args.prompt : null;

	return (
		<View className={nested ? "py-1" : "my-1"}>
			<Pressable
				disabled={!prompt}
				onPress={() => setOpen((value) => !value)}
				className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0"
			>
				<Icon icon={Bot} className="h-3.5 w-3.5 text-muted-foreground" />
				<Text className="text-sm text-muted-foreground">Created</Text>
				<Text className="text-sm font-medium text-muted-foreground">
					{label}
				</Text>
				{target?.role ? (
					<Text className="text-sm text-muted-foreground/70">
						({target.role})
					</Text>
				) : null}
			</Pressable>
			{prompt ? (
				<Text
					numberOfLines={open ? undefined : 2}
					className="ml-5 mt-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm leading-5 text-muted-foreground"
				>
					{prompt}
				</Text>
			) : null}
		</View>
	);
}

function SubAgentWaitRow({ part }: { part: ToolCallPart }) {
	const states = useMemo(() => readAgentStates(part.args), [part.args]);
	const [open, setOpen] = useState(false);
	const status = String(part.args.status ?? "completed");
	const live = isLiveStatus(status);
	const completedCount = states.filter(
		(state) => state.status === "completed",
	).length;
	const headline = live
		? `Waiting on ${states.length || "agents"}...`
		: completedCount
			? `Collected ${completedCount} of ${states.length} agent results`
			: "Waiting complete";
	const hasBodies = states.some((state) => state.message?.trim());

	return (
		<View className="my-1">
			<Pressable
				disabled={!hasBodies}
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-1.5 py-1"
			>
				<Icon icon={Sparkles} className="h-3.5 w-3.5 text-muted-foreground" />
				<Text className="text-sm font-medium text-muted-foreground">
					{headline}
				</Text>
				<StatusIcon status={status} isError={part.isError === true} />
			</Pressable>
			{open && hasBodies ? (
				<View className="ml-1 border-l border-border/50 pl-3">
					{states.map((state) => (
						<View key={state.threadId} className="py-1">
							<View className="flex-row flex-wrap items-center gap-x-1.5">
								<Icon
									icon={Bot}
									className="h-3.5 w-3.5 text-muted-foreground/70"
								/>
								<Text className="text-sm font-medium text-muted-foreground">
									{state.nickname ?? "Sub-agent"}
								</Text>
								{state.role ? (
									<Text className="text-sm text-muted-foreground/60">
										({state.role})
									</Text>
								) : null}
								{state.status ? (
									<Text className="text-sm text-muted-foreground/60">
										- {state.status}
									</Text>
								) : null}
							</View>
							{state.message ? (
								<Text className="ml-5 mt-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm leading-5 text-muted-foreground">
									{state.message}
								</Text>
							) : null}
						</View>
					))}
				</View>
			) : null}
		</View>
	);
}

function SubAgentMiscRow({ part }: { part: ToolCallPart }) {
	const states = useMemo(() => readAgentStates(part.args), [part.args]);
	const target = states[0];
	const verb =
		part.toolName === "subagent_send_input"
			? "Sent input"
			: part.toolName === "subagent_resume"
				? "Resumed"
				: part.toolName === "subagent_close"
					? "Closed"
					: "Sub-agent action";
	const status = String(part.args.status ?? "completed");

	return (
		<View className="my-1 flex-row flex-wrap items-center gap-x-1.5">
			<Icon icon={Bot} className="h-3.5 w-3.5 text-muted-foreground" />
			<Text className="text-sm font-medium text-muted-foreground">{verb}</Text>
			{target ? (
				<Text className="text-sm text-muted-foreground">
					{target.nickname ?? "Sub-agent"}
				</Text>
			) : null}
			<StatusIcon status={status} isError={part.isError === true} />
		</View>
	);
}

function StatusIcon({ status, isError }: { status: string; isError: boolean }) {
	if (isLiveStatus(status)) {
		return (
			<Icon icon={LoaderCircle} className="h-3 w-3 text-muted-foreground/70" />
		);
	}
	if (status === "failed" || isError) {
		return <Icon icon={CircleAlert} className="h-3 w-3 text-destructive" />;
	}
	if (status === "completed") {
		return <Icon icon={Check} className="h-3 w-3 text-emerald-500" />;
	}
	return null;
}

function readAgentStates(args: Record<string, unknown>): AgentState[] {
	const raw = args.agentsStates;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
	return Object.entries(raw as Record<string, unknown>).flatMap(
		([threadId, value]) => {
			if (!value || typeof value !== "object" || Array.isArray(value))
				return [];
			const record = value as Record<string, unknown>;
			return [
				{
					threadId,
					nickname:
						typeof record.agentNickname === "string"
							? record.agentNickname
							: null,
					role: typeof record.agentRole === "string" ? record.agentRole : null,
					status: typeof record.status === "string" ? record.status : null,
					message: typeof record.message === "string" ? record.message : null,
				},
			];
		},
	);
}

function isLiveStatus(status: string): boolean {
	return status === "in_progress" || status === "inProgress";
}
