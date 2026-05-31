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
	const hasDetails =
		!!preview ||
		!!info.fullCommand ||
		!!info.files?.length ||
		!!part.children?.length;

	return (
		<View className="my-0.5">
			<Pressable
				disabled={!hasDetails}
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-1.5 rounded-md bg-muted/25 px-2 py-1.5"
			>
				<ToolIcon kind={info.kind} isError={part.isError === true} />
				<Text
					className="min-w-0 flex-1 text-xs font-medium text-foreground"
					numberOfLines={1}
				>
					{info.action}
				</Text>
				<StatusGlyph part={part} />
				{info.diffAdd || info.diffDel ? (
					<Text className="text-[11px] text-muted-foreground">
						+{info.diffAdd ?? 0} -{info.diffDel ?? 0}
					</Text>
				) : null}
				{hasDetails ? (
					<Icon
						icon={ChevronDown}
						className={`h-3.5 w-3.5 text-muted-foreground ${open ? "" : "-rotate-90"}`}
					/>
				) : null}
			</Pressable>
			{open && !compact ? (
				<View className="ml-2 border-l border-border/50 pl-2 pt-1">
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
								) : null,
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
	return (
		<View className="my-0.5">
			<Pressable
				onPress={() => setOpen((value) => !value)}
				className="flex-row items-center gap-1.5 rounded-md bg-muted/25 px-2 py-1.5"
			>
				<GroupIcon category={group.category} />
				<Text
					className="flex-1 text-xs font-medium text-foreground"
					numberOfLines={1}
				>
					{group.summary}
				</Text>
				{group.active ? (
					<Icon
						icon={LoaderCircle}
						className="h-3.5 w-3.5 text-muted-foreground"
					/>
				) : (
					<Icon icon={Check} className="h-3.5 w-3.5 text-emerald-500" />
				)}
				<Text className="text-[11px] text-muted-foreground">
					{group.tools.length} tools
				</Text>
			</Pressable>
			{open ? (
				<View className="ml-2 border-l border-border/50 pl-2 pt-1">
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
					className="text-[11px] leading-4 text-muted-foreground"
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
		return <Icon icon={CircleAlert} className="h-3.5 w-3.5 text-destructive" />;
	if (kind === "shell")
		return (
			<Icon icon={Terminal} className="h-3.5 w-3.5 text-muted-foreground" />
		);
	if (kind === "search" || kind === "web") {
		return <Icon icon={Search} className="h-3.5 w-3.5 text-muted-foreground" />;
	}
	if (kind === "mcp")
		return <Icon icon={Plug} className="h-3.5 w-3.5 text-muted-foreground" />;
	if (kind === "file" || kind === "edit") {
		return (
			<Icon icon={FileText} className="h-3.5 w-3.5 text-muted-foreground" />
		);
	}
	if (kind === "prompt" || kind === "plan") {
		return <Icon icon={Code2} className="h-3.5 w-3.5 text-muted-foreground" />;
	}
	return <Icon icon={Wrench} className="h-3.5 w-3.5 text-muted-foreground" />;
}

function GroupIcon({ category }: { category: CollapsedGroupPart["category"] }) {
	if (category === "shell") {
		return (
			<Icon icon={Terminal} className="h-3.5 w-3.5 text-muted-foreground" />
		);
	}
	if (category === "search") {
		return <Icon icon={Search} className="h-3.5 w-3.5 text-muted-foreground" />;
	}
	return <Icon icon={FileText} className="h-3.5 w-3.5 text-muted-foreground" />;
}

function StatusGlyph({ part }: { part: ToolCallPart }) {
	if (
		part.streamingStatus === "running" ||
		part.streamingStatus === "streaming_input"
	) {
		return (
			<Icon icon={LoaderCircle} className="h-3 w-3 text-muted-foreground" />
		);
	}
	if (part.isError) {
		return <Icon icon={CircleAlert} className="h-3 w-3 text-destructive" />;
	}
	if (part.streamingStatus === "done" || part.result != null) {
		return <Icon icon={Check} className="h-3 w-3 text-emerald-500" />;
	}
	return null;
}

function CodePreview({ label, text }: { label: string; text: string }) {
	return (
		<View className="mb-1.5 rounded-md bg-muted/45 px-2 py-1.5">
			<Text className="mb-1 text-[11px] font-medium text-muted-foreground">
				{label}
			</Text>
			<Text
				selectable
				className="font-mono text-[11px] leading-4 text-foreground"
			>
				{text}
			</Text>
		</View>
	);
}
