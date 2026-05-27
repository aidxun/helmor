import type {
	ImagePart,
	PlanReviewPart,
	PromptSuggestionPart,
	TodoListPart,
} from "@helmor/thread-schema";
import { Image } from "expo-image";
import {
	Check,
	Circle,
	Clock3,
	FileText,
	MessageSquareText,
} from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { ChatMarkdown } from "@/components/markdown";

export const TodoListBlock = memo(function TodoListBlock({
	part,
}: {
	part: TodoListPart;
}) {
	const completed = part.items.filter(
		(item) => item.status === "completed",
	).length;
	return (
		<View className="my-1 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
			<View className="mb-2 flex-row items-center justify-between">
				<Text className="text-sm font-semibold text-foreground">Todo</Text>
				<Text className="text-xs text-muted-foreground">
					{completed}/{part.items.length}
				</Text>
			</View>
			<View className="gap-1.5">
				{part.items.map((item, index) => (
					<View
						key={`${item.status}:${item.text}:${index}`}
						className="flex-row gap-2"
					>
						<TodoIcon status={item.status} />
						<Text className="flex-1 text-sm leading-5 text-muted-foreground">
							{item.text}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
});

export const ImageBlock = memo(function ImageBlock({
	part,
}: {
	part: ImagePart;
}) {
	const source = resolveImageSource(part);
	if (!source) {
		const path = part.source.kind === "file" ? part.source.path : "Image";
		return (
			<View className="my-1 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
				<Text className="text-sm text-muted-foreground">{path}</Text>
			</View>
		);
	}

	return (
		<View className="my-1 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
			<Image
				source={source}
				contentFit="cover"
				style={{ width: "100%", aspectRatio: 16 / 9 }}
			/>
		</View>
	);
});

export const PromptSuggestionButton = memo(function PromptSuggestionButton({
	part,
	onPress,
}: {
	part: PromptSuggestionPart;
	onPress?: (text: string) => void;
}) {
	return (
		<Pressable
			onPress={() => onPress?.(part.text)}
			className="my-1 flex-row items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-2"
		>
			<Icon
				icon={MessageSquareText}
				className="h-4 w-4 text-muted-foreground"
			/>
			<Text className="flex-1 text-sm text-muted-foreground" numberOfLines={2}>
				{part.text}
			</Text>
		</Pressable>
	);
});

export const PlanReviewCard = memo(function PlanReviewCard({
	part,
	onPrompt,
}: {
	part: PlanReviewPart;
	onPrompt?: (text: string) => void;
}) {
	return (
		<View className="my-1 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
			<View className="mb-2 flex-row items-center gap-2">
				<Icon icon={FileText} className="h-4 w-4 text-muted-foreground" />
				<Text className="flex-1 text-sm font-semibold text-foreground">
					Plan review
				</Text>
			</View>
			{part.planFilePath ? (
				<Text className="mb-2 text-xs text-muted-foreground" numberOfLines={1}>
					{part.planFilePath}
				</Text>
			) : null}
			{part.plan ? <ChatMarkdown>{part.plan}</ChatMarkdown> : null}
			{part.allowedPrompts?.length ? (
				<View className="mt-2 gap-1.5">
					{part.allowedPrompts.map((prompt, index) => (
						<Pressable
							key={`${prompt.tool}:${index}`}
							onPress={() => onPrompt?.(prompt.prompt)}
							className="rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2"
						>
							<Text className="text-sm font-medium text-foreground">
								{prompt.tool}
							</Text>
							<Text
								className="mt-0.5 text-xs text-muted-foreground"
								numberOfLines={2}
							>
								{prompt.prompt}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}
		</View>
	);
});

function TodoIcon({
	status,
}: {
	status: TodoListPart["items"][number]["status"];
}) {
	if (status === "completed") {
		return <Icon icon={Check} className="mt-0.5 h-4 w-4 text-emerald-500" />;
	}
	if (status === "in_progress") {
		return <Icon icon={Clock3} className="mt-0.5 h-4 w-4 text-amber-500" />;
	}
	return (
		<Icon icon={Circle} className="mt-0.5 h-4 w-4 text-muted-foreground" />
	);
}

function resolveImageSource(part: ImagePart): string | { uri: string } | null {
	if (part.source.kind === "url") return { uri: part.source.url };
	if (part.source.kind === "base64") {
		const mediaType = part.mediaType ?? "image/png";
		return { uri: `data:${mediaType};base64,${part.source.data}` };
	}
	return null;
}
