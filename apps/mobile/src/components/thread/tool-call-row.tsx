import type { CollapsedGroupPart, ToolCallPart } from "@helmor/thread-schema";
import { partKey } from "@helmor/thread-schema";
import {
	Check,
	ChevronDown,
	CircleAlert,
	Code2,
	FileText,
	LoaderCircle,
	Plug,
	Search,
	Terminal,
	Wrench,
} from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { getMobileToolInfo, previewValue } from "./tool-info";

export const ToolCallRow = memo(function ToolCallRow({
	part,
	compact = false,
}: {
	part: ToolCallPart;
	compact?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const info = getMobileToolInfo(part);
	const preview = previewValue(part.result) ?? previewValue(part.argsText, 220);
	const target = toolTarget(info);
	const statusLabel = toolStatusLabel(part);
	const tone = toolTone(part);
	const hasDetails =
		!!preview ||
		!!info.fullCommand ||
		!!info.files?.length ||
		!!part.children?.length;

	return (
		<View className={compact ? "my-0.5" : "my-1"}>
			<Pressable
				disabled={!hasDetails}
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-1.5 rounded-md px-1 py-0.5 active:bg-muted/20"
			>
				<View className={`h-3 w-0.5 rounded-full ${tone.bar}`} />
				<ToolIcon kind={info.kind} isError={part.isError === true} />
				<View className="min-w-0 flex-1 flex-row items-baseline">
					<Text className={`text-xs ${tone.title}`} numberOfLines={1}>
						{info.action}
					</Text>
					{target ? (
						<Text
							className="min-w-0 flex-1 text-xs text-muted-foreground/55"
							numberOfLines={1}
						>
							{" "}
							{target}
						</Text>
					) : null}
				</View>
				<StatusGlyph part={part} />
				{info.diffAdd || info.diffDel ? (
					<Text className="text-[11px] text-muted-foreground/50">
						+{info.diffAdd ?? 0} -{info.diffDel ?? 0}
					</Text>
				) : null}
				{statusLabel ? (
					<Text className={`text-[11px] ${tone.statusText}`}>
						{statusLabel}
					</Text>
				) : null}
				{hasDetails ? (
					<Icon
						icon={ChevronDown}
						className={`h-3 w-3 text-muted-foreground/40 ${open ? "" : "-rotate-90"}`}
					/>
				) : null}
			</Pressable>
			{open ? (
				<View className={`ml-3 mt-1 border-l pl-2 ${tone.detailBorder}`}>
					<ToolDetails info={info} />
					{info.fullCommand ? (
						<CodePreview label="Command" text={info.fullCommand} />
					) : null}
					{info.files?.length ? (
						<View className="mb-2 gap-1">
							{info.files.map((file) => (
								<Text key={file.name} className="text-xs text-muted-foreground">
									{file.name} +{file.diffAdd ?? 0} -{file.diffDel ?? 0}
								</Text>
							))}
						</View>
					) : null}
					{preview ? <CodePreview label="Result" text={preview} /> : null}
					{part.children?.length ? (
						<View className="gap-1">
							{part.children.map((child) =>
								child.type === "tool-call" ? (
									<ToolCallRow key={child.toolCallId} part={child} compact />
								) : child.type === "text" ? (
									<Text
										key={partKey(child)}
										className="text-sm leading-5 text-muted-foreground"
										numberOfLines={4}
									>
										{child.text}
									</Text>
								) : (
									<Text
										key={partKey(child)}
										className="text-[11px] leading-4 text-muted-foreground/60"
									>
										Unsupported child part: {child.type}
									</Text>
								),
							)}
						</View>
					) : null}
				</View>
			) : null}
		</View>
	);
});

export const CollapsedToolGroup = memo(function CollapsedToolGroup({
	group,
}: {
	group: CollapsedGroupPart;
}) {
	const [open, setOpen] = useState(false);
	const tone = collapsedGroupTone(group);
	return (
		<View className="my-1">
			<Pressable
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-1.5 rounded-md px-1 py-0.5 active:bg-muted/20"
			>
				<View className={`h-3 w-0.5 rounded-full ${tone.bar}`} />
				<GroupIcon category={group.category} />
				<Text className={`flex-1 text-xs ${tone.title}`} numberOfLines={1}>
					{group.summary}
				</Text>
				<GroupStatusGlyph group={group} />
				<Text className="text-[11px] text-muted-foreground/45">
					{group.tools.length} tools
				</Text>
			</Pressable>
			{open ? (
				<View className={`ml-3 mt-1 border-l pl-2 ${tone.detailBorder}`}>
					{group.tools.map((tool) => (
						<ToolCallRow key={tool.toolCallId} part={tool} compact />
					))}
				</View>
			) : null}
		</View>
	);
});

function ToolDetails({ info }: { info: ReturnType<typeof getMobileToolInfo> }) {
	const details = [
		info.file ? `File: ${info.file}` : null,
		!info.fullCommand && info.command ? `Command: ${info.command}` : null,
		info.detail ?? null,
		info.body ?? null,
	].filter((detail): detail is string => Boolean(detail));
	if (!details.length) return null;
	return (
		<View className="mb-1.5 gap-0.5">
			{details.map((detail) => (
				<Text
					key={detail}
					className="text-[11px] leading-4 text-muted-foreground/60"
					numberOfLines={3}
				>
					{detail}
				</Text>
			))}
		</View>
	);
}

function ToolIcon({
	kind,
	isError,
}: {
	kind: ReturnType<typeof getMobileToolInfo>["kind"];
	isError: boolean;
}) {
	if (isError)
		return <Icon icon={CircleAlert} className="h-3 w-3 text-destructive" />;
	if (kind === "shell")
		return (
			<Icon icon={Terminal} className="h-3 w-3 text-muted-foreground/60" />
		);
	if (kind === "search" || kind === "web") {
		return <Icon icon={Search} className="h-3 w-3 text-muted-foreground/60" />;
	}
	if (kind === "mcp")
		return <Icon icon={Plug} className="h-3 w-3 text-muted-foreground/60" />;
	if (kind === "file" || kind === "edit") {
		return (
			<Icon icon={FileText} className="h-3 w-3 text-muted-foreground/60" />
		);
	}
	if (kind === "prompt" || kind === "plan") {
		return <Icon icon={Code2} className="h-3 w-3 text-muted-foreground/60" />;
	}
	return <Icon icon={Wrench} className="h-3 w-3 text-muted-foreground/60" />;
}

function GroupIcon({ category }: { category: CollapsedGroupPart["category"] }) {
	if (category === "shell") {
		return (
			<Icon icon={Terminal} className="h-3 w-3 text-muted-foreground/60" />
		);
	}
	if (category === "search") {
		return <Icon icon={Search} className="h-3 w-3 text-muted-foreground/60" />;
	}
	return <Icon icon={FileText} className="h-3 w-3 text-muted-foreground/60" />;
}

function StatusGlyph({ part }: { part: ToolCallPart }) {
	if (
		part.streamingStatus === "running" ||
		part.streamingStatus === "streaming_input"
	) {
		return <Icon icon={LoaderCircle} className="h-3 w-3 text-amber-500/80" />;
	}
	if (part.isError || part.streamingStatus === "error") {
		return <Icon icon={CircleAlert} className="h-3 w-3 text-destructive" />;
	}
	if (part.streamingStatus === "done" || part.result != null) {
		return <Icon icon={Check} className="h-3 w-3 text-emerald-500/80" />;
	}
	return null;
}

function GroupStatusGlyph({ group }: { group: CollapsedGroupPart }) {
	if (
		group.tools.some((tool) => tool.isError || tool.streamingStatus === "error")
	) {
		return <Icon icon={CircleAlert} className="h-3 w-3 text-destructive" />;
	}
	if (group.active) {
		return <Icon icon={LoaderCircle} className="h-3 w-3 text-amber-500/80" />;
	}
	return <Icon icon={Check} className="h-3 w-3 text-emerald-500/80" />;
}

function CodePreview({ label, text }: { label: string; text: string }) {
	return (
		<View className="mb-1.5 rounded-md bg-muted/25 px-2 py-1.5">
			<Text className="mb-1 text-[11px] font-medium text-muted-foreground/60">
				{label}
			</Text>
			<Text
				selectable
				className="font-mono text-[11px] leading-4 text-foreground/85"
			>
				{text}
			</Text>
		</View>
	);
}

function toolTarget(info: ReturnType<typeof getMobileToolInfo>): string | null {
	return (
		info.file ??
		info.command ??
		info.detail ??
		(info.files?.length ? `${info.files.length} files` : null)
	);
}

function toolStatusLabel(part: ToolCallPart): string | null {
	if (
		part.streamingStatus === "running" ||
		part.streamingStatus === "streaming_input"
	) {
		return "running";
	}
	if (part.isError || part.streamingStatus === "error") return "failed";
	return null;
}

type ToolTone = {
	bar: string;
	title: string;
	statusText: string;
	detailBorder: string;
};

function toolTone(part: ToolCallPart): ToolTone {
	if (part.isError || part.streamingStatus === "error") {
		return {
			bar: "bg-destructive/80",
			title: "text-destructive/90",
			statusText: "text-destructive/75",
			detailBorder: "border-destructive/30",
		};
	}
	if (
		part.streamingStatus === "running" ||
		part.streamingStatus === "streaming_input"
	) {
		return {
			bar: "bg-amber-500/75",
			title: "text-amber-700 dark:text-amber-400",
			statusText: "text-amber-700/70 dark:text-amber-400/70",
			detailBorder: "border-amber-500/25",
		};
	}
	if (part.streamingStatus === "done" || part.result != null) {
		return {
			bar: "bg-emerald-500/70",
			title: "text-emerald-700 dark:text-emerald-400",
			statusText: "text-emerald-700/65 dark:text-emerald-400/65",
			detailBorder: "border-emerald-500/25",
		};
	}
	return {
		bar: "bg-muted-foreground/25",
		title: "text-muted-foreground",
		statusText: "text-muted-foreground/45",
		detailBorder: "border-border/35",
	};
}

function collapsedGroupTone(group: CollapsedGroupPart): ToolTone {
	if (
		group.tools.some((tool) => tool.isError || tool.streamingStatus === "error")
	) {
		return {
			bar: "bg-destructive/80",
			title: "text-destructive/90",
			statusText: "text-destructive/75",
			detailBorder: "border-destructive/30",
		};
	}
	if (group.active) {
		return {
			bar: "bg-amber-500/75",
			title: "text-amber-700 dark:text-amber-400",
			statusText: "text-amber-700/70 dark:text-amber-400/70",
			detailBorder: "border-amber-500/25",
		};
	}
	return {
		bar: "bg-emerald-500/70",
		title: "text-emerald-700 dark:text-emerald-400",
		statusText: "text-emerald-700/65 dark:text-emerald-400/65",
		detailBorder: "border-emerald-500/25",
	};
}
