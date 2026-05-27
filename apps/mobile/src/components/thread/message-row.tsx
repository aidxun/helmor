import {
	extractPlainText,
	isFileMentionPart,
	isPromptSuggestionPart,
	isSystemNoticePart,
	isTextPart,
	type TextPart,
	type ThreadMessageLike,
} from "@helmor/thread-schema";
import { CircleAlert, Info } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import {
	AssistantParts,
	FileMentionChip,
	SystemNotice,
} from "./assistant-parts";
import { PromptSuggestionButton } from "./structured-parts";

export const ThreadMessageRow = memo(function ThreadMessageRow({
	message,
	onPromptSuggestion,
}: {
	message: ThreadMessageLike;
	onPromptSuggestion?: (text: string) => void;
}) {
	if (message.role === "user") {
		return <UserMessage message={message} />;
	}
	if (message.role === "assistant") {
		return (
			<AssistantMessage
				message={message}
				onPromptSuggestion={onPromptSuggestion}
			/>
		);
	}
	return <SystemMessage message={message} onPrompt={onPromptSuggestion} />;
});

function UserMessage({ message }: { message: ThreadMessageLike }) {
	const text = extractPlainText(message.content);
	const files = message.content.filter(isFileMentionPart);
	return (
		<View className="mb-2 max-w-[82%] self-end rounded-2xl border-continuous bg-user-bubble px-3 py-2.5">
			{text ? (
				<Text selectable className="text-base leading-5.5 text-foreground">
					{text}
				</Text>
			) : null}
			{files.length ? (
				<View className="mt-2 gap-1">
					{files.map((file) => (
						<FileMentionChip key={file.id} path={file.path} />
					))}
				</View>
			) : null}
		</View>
	);
}

function AssistantMessage({
	message,
	onPromptSuggestion,
}: {
	message: ThreadMessageLike;
	onPromptSuggestion?: (text: string) => void;
}) {
	return (
		<View className="mb-3 min-w-0">
			<AssistantParts
				message={message}
				onPromptSuggestion={onPromptSuggestion}
			/>
		</View>
	);
}

function SystemMessage({
	message,
	onPrompt,
}: {
	message: ThreadMessageLike;
	onPrompt?: (text: string) => void;
}) {
	return (
		<View className="mb-2 px-1">
			{message.content.map((part) => {
				if (isSystemNoticePart(part)) {
					return <SystemNotice key={part.id} part={part} />;
				}
				if (isPromptSuggestionPart(part)) {
					return (
						<PromptSuggestionButton
							key={part.id}
							part={part}
							onPress={onPrompt}
						/>
					);
				}
				if (isTextPart(part)) {
					return <SystemText key={part.id} part={part} />;
				}
				return null;
			})}
		</View>
	);
}

function SystemText({ part }: { part: TextPart }) {
	const isError = /^Error:/i.test(part.text);
	return (
		<View className="my-1 flex-row items-center gap-2 px-2">
			<Icon
				icon={isError ? CircleAlert : Info}
				className={
					isError ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"
				}
			/>
			<Text className="flex-1 text-sm leading-5 text-muted-foreground">
				{part.text}
			</Text>
		</View>
	);
}
