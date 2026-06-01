import {
	type ExtendedMessagePart,
	extractPlainText,
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
	type ThreadMessageLike,
} from "@helmor/thread-schema";
import { Streamdown } from "streamdown";

export function MessageList({ messages }: { messages: ThreadMessageLike[] }) {
	if (messages.length === 0) {
		return (
			<div className="empty-state">
				<div className="empty-title">No messages yet</div>
				<div className="empty-copy">
					Send a prompt from your phone or desktop.
				</div>
			</div>
		);
	}

	return (
		<div className="message-list">
			{messages.map((message, index) => (
				<MessageBubble
					key={message.id ?? `${message.role}:${message.createdAt ?? index}`}
					message={message}
				/>
			))}
		</div>
	);
}

function MessageBubble({ message }: { message: ThreadMessageLike }) {
	const text = extractPlainText(message.content);
	return (
		<article className={`message message-${message.role}`}>
			<div className="message-avatar" aria-hidden="true">
				{message.role === "user" ? "U" : "H"}
			</div>
			<div className="message-inner">
				<header className="message-header">
					<span>{roleLabel(message.role)}</span>
					{message.streaming ? (
						<span className="live-dot">Streaming</span>
					) : null}
				</header>
				<div className="message-body">
					{message.content.map((part) => (
						<MessagePartView key={partKey(part)} part={part} />
					))}
					{message.content.length === 0 && text ? (
						<MarkdownText text={text} />
					) : null}
					{message.status ? <StatusBadge status={message.status} /> : null}
				</div>
			</div>
		</article>
	);
}

function MessagePartView({ part }: { part: ExtendedMessagePart }) {
	if (isTextPart(part)) return <MarkdownText text={part.text} />;
	if (isReasoningPart(part)) {
		return (
			<details className="part-card reasoning-card" open={part.streaming}>
				<summary>Reasoning{durationLabel(part.durationMs)}</summary>
				<pre>{part.text}</pre>
			</details>
		);
	}
	if (isToolCallPart(part)) {
		return (
			<details className="part-card tool-card">
				<summary>{part.toolName}</summary>
				<pre>{part.argsText || JSON.stringify(part.args, null, 2)}</pre>
				{part.result !== undefined ? (
					<pre>{formatUnknown(part.result)}</pre>
				) : null}
			</details>
		);
	}
	if (isCollapsedGroupPart(part)) {
		return (
			<details className="part-card tool-card">
				<summary>{part.summary}</summary>
				{part.tools.map((tool) => (
					<div key={tool.toolCallId} className="tool-line">
						{tool.toolName}
					</div>
				))}
			</details>
		);
	}
	if (isSystemNoticePart(part)) {
		return (
			<div className={`part-card notice-card notice-${part.severity}`}>
				<strong>{part.label}</strong>
				{part.body ? <p>{part.body}</p> : null}
			</div>
		);
	}
	if (isTodoListPart(part)) {
		return (
			<ul className="todo-list">
				{part.items.map((item, index) => (
					<li key={`${item.status}:${index}`}>
						<span>{item.status.replace(/_/g, " ")}</span>
						{item.text}
					</li>
				))}
			</ul>
		);
	}
	if (isImagePart(part)) {
		return <div className="file-chip">Image: {imageLabel(part.source)}</div>;
	}
	if (isFileMentionPart(part)) {
		return <div className="file-chip">{part.path}</div>;
	}
	if (isPromptSuggestionPart(part)) {
		return <div className="suggestion-chip">{part.text}</div>;
	}
	if (isPlanReviewPart(part)) {
		return (
			<div className="part-card plan-card">
				<strong>{part.toolName}</strong>
				{part.plan ? <MarkdownText text={part.plan} /> : null}
			</div>
		);
	}
	return null;
}

function MarkdownText({ text }: { text: string }) {
	if (!text.trim()) return null;
	return (
		<div className="markdown">
			<Streamdown>{text}</Streamdown>
		</div>
	);
}

function StatusBadge({
	status,
}: {
	status: NonNullable<ThreadMessageLike["status"]>;
}) {
	return (
		<div className="status-badge">
			{status.reason ? `${status.type}: ${status.reason}` : status.type}
		</div>
	);
}

function roleLabel(role: ThreadMessageLike["role"]): string {
	if (role === "assistant") return "Assistant";
	if (role === "user") return "You";
	if (role === "error") return "Error";
	return "System";
}

function durationLabel(durationMs?: number): string {
	if (typeof durationMs !== "number") return "";
	return ` ${Math.round(durationMs / 1000)}s`;
}

function imageLabel(
	source: Extract<ExtendedMessagePart, { type: "image" }>["source"],
) {
	if (source.kind === "file") return source.path;
	if (source.kind === "url") return source.url;
	return "attached image";
}

function formatUnknown(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}
