import {
  AlertCircle,
  Bot,
  BrainCircuit,
  Clock3,
  FileText,
  FolderKanban,
  GitBranch,
  Image as ImageIcon,
  MessageSquareText,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { cn } from "../lib/utils";
import type {
  SessionAttachmentRecord,
  SessionMessageRecord,
  WorkspaceDetail,
  WorkspaceSessionSummary,
} from "../lib/conductor";

type WorkspacePanelProps = {
  workspace: WorkspaceDetail | null;
  sessions: WorkspaceSessionSummary[];
  selectedSessionId: string | null;
  messages: SessionMessageRecord[];
  attachments: SessionAttachmentRecord[];
  loadingWorkspace?: boolean;
  loadingSession?: boolean;
  onSelectSession?: (sessionId: string) => void;
};

type TimelineBlock =
  | { id: string; kind: "thinking"; text: string }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "tool"; label: string }
  | { id: string; kind: "result"; text: string };

export function WorkspacePanel({
  workspace,
  sessions,
  selectedSessionId,
  messages,
  attachments,
  loadingWorkspace = false,
  loadingSession = false,
  onSelectSession,
}: WorkspacePanelProps) {
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const attachmentIndex = new Map(
    attachments.map((attachment) => [attachment.id, attachment]),
  );
  const attachmentsByMessage = new Map<string, SessionAttachmentRecord[]>();

  for (const attachment of attachments) {
    if (!attachment.sessionMessageId) {
      continue;
    }

    const current = attachmentsByMessage.get(attachment.sessionMessageId) ?? [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.sessionMessageId, current);
  }

  const visibleMessages = messages.slice(-24);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-elevated">
      <header className="relative z-20 border-b border-app-border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div
          aria-label="Workspace header"
          className="flex h-[2.4rem] items-center justify-between gap-3 px-4"
          data-tauri-drag-region
        >
          <div className="flex min-w-0 items-center gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1 rounded-md border border-app-border-strong bg-app-sidebar px-2 py-1 font-medium text-app-foreground-soft">
              <FolderKanban className="size-3.5 text-app-project" strokeWidth={1.9} />
              <span className="truncate">{workspace?.repoName ?? "Workspace"}</span>
            </span>

            <span className="text-app-muted">/</span>

            <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base/70 px-2 py-1 font-medium text-app-foreground">
              <GitBranch className="size-3.5 text-app-warm" strokeWidth={1.9} />
              <span className="truncate">{workspace?.branch ?? "No branch"}</span>
            </span>

            {workspace?.state === "archived" ? (
              <span className="rounded-md border border-app-border bg-app-sidebar px-2 py-1 font-medium text-app-muted">
                Archived
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-app-muted">
            {workspace ? (
              <>
                <span>{workspace.sessionCount} sessions</span>
                <span>{workspace.messageCount} events</span>
                <span>{workspace.attachmentCount} attachments</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex h-[2.7rem] items-end gap-1 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
          {loadingWorkspace ? (
            <div className="flex items-center gap-2 px-3 text-[12px] text-app-muted">
              <Clock3 className="size-3.5 animate-pulse" strokeWidth={1.8} />
              Loading sessions
            </div>
          ) : sessions.length > 0 ? (
            sessions.map((session) => {
              const selected = session.id === selectedSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    onSelectSession?.(session.id);
                  }}
                  className={cn(
                    "group relative flex h-full min-w-[9rem] max-w-[14rem] items-center gap-2 rounded-t-xl border border-b-0 px-3 text-left transition-colors",
                    selected
                      ? "border-app-border-strong bg-app-base text-app-foreground"
                      : "border-transparent bg-transparent text-app-foreground-soft hover:bg-app-toolbar-hover/70 hover:text-app-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold uppercase",
                      session.agentType === "codex"
                        ? "border-app-border-strong bg-app-project/15 text-app-project"
                        : "border-app-border-strong bg-app-sidebar text-app-foreground-soft",
                    )}
                  >
                    {session.agentType === "codex" ? "C" : "A"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">
                      {displaySessionTitle(session)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-app-muted">
                      <span
                        className={cn(
                          "inline-block size-1.5 rounded-full",
                          session.status === "error"
                            ? "bg-app-canceled"
                            : session.active
                              ? "bg-app-progress"
                              : "bg-app-review",
                        )}
                      />
                      <span className="truncate">
                        {session.agentType === "codex" ? "Codex" : "Claude"}
                      </span>
                      <span className="text-app-border-strong">•</span>
                      <span className="truncate">{session.model ?? "default model"}</span>
                    </div>
                  </div>

                  {selected ? (
                    <span className="absolute inset-x-3 bottom-0 h-px bg-app-project" />
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="flex items-center gap-2 px-3 text-[12px] text-app-muted">
              <AlertCircle className="size-3.5" strokeWidth={1.8} />
              No sessions
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-app-border px-4 py-3">
          {workspace ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-sidebar px-2 py-1 font-medium text-app-foreground-soft">
                  <Sparkles className="size-3.5 text-app-accent" strokeWidth={1.8} />
                  {workspace.title}
                </span>

                {workspace.prTitle ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1 text-app-foreground-soft">
                    <MessageSquareText className="size-3.5 text-app-review" strokeWidth={1.8} />
                    {workspace.prTitle}
                  </span>
                ) : null}

                {selectedSession ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1 text-app-muted">
                    <Bot className="size-3.5" strokeWidth={1.8} />
                    {displaySessionTitle(selectedSession)}
                  </span>
                ) : null}
              </div>

              {selectedSession ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-sidebar px-2 py-1">
                    <Bot className="size-3.5 text-app-foreground-soft" strokeWidth={1.8} />
                    {selectedSession.agentType === "codex" ? "Codex" : "Claude"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1">
                    <Sparkles className="size-3.5 text-app-project" strokeWidth={1.8} />
                    {selectedSession.model ?? "default model"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1">
                    <Clock3 className="size-3.5 text-app-review" strokeWidth={1.8} />
                    Updated {formatTimestamp(selectedSession.updatedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1">
                    <TerminalSquare className="size-3.5 text-app-warm" strokeWidth={1.8} />
                    {humanizeStatus(selectedSession.status)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1">
                    <BrainCircuit className="size-3.5 text-app-accent" strokeWidth={1.8} />
                    {selectedSession.thinkingEnabled ? "Thinking on" : "Thinking off"}
                  </span>
                  {typeof selectedSession.contextUsedPercent === "number" ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-base px-2 py-1">
                      <FileText className="size-3.5 text-app-project" strokeWidth={1.8} />
                      Context {Math.round(selectedSession.contextUsedPercent)}%
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-[12px] text-app-muted">Select a workspace</div>
          )}
        </div>

        <div
          aria-label="Workspace timeline"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5"
        >
          {loadingSession ? (
            <div className="flex items-center gap-2 rounded-2xl border border-app-border bg-app-sidebar px-4 py-3 text-sm text-app-muted">
              <Clock3 className="size-4 animate-pulse" strokeWidth={1.8} />
              Loading session timeline
            </div>
          ) : visibleMessages.length > 0 ? (
            <div className="space-y-4">
              {visibleMessages.map((message) => (
                <TimelineMessage
                  key={message.id}
                  message={message}
                  attachments={attachmentsByMessage.get(message.id) ?? []}
                  attachmentIndex={attachmentIndex}
                />
              ))}
            </div>
          ) : (
            <div className="m-auto max-w-md rounded-[22px] border border-app-border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-app-border-strong bg-app-sidebar text-app-foreground-soft">
                <MessageSquareText className="size-5" strokeWidth={1.8} />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-app-foreground">
                {selectedSession ? "This session is quiet for now" : "No session selected"}
              </h3>
              <p className="mt-2 text-[13px] leading-6 text-app-muted">
                {selectedSession
                  ? "The selected session does not have stored timeline events in this fixture yet."
                  : "Pick a session tab to inspect its stored Conductor data."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineMessage({
  message,
  attachments,
  attachmentIndex,
}: {
  message: SessionMessageRecord;
  attachments: SessionAttachmentRecord[];
  attachmentIndex: Map<string, SessionAttachmentRecord>;
}) {
  const blocks = getTimelineBlocks(message, attachmentIndex);
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[52rem] space-y-2", isUser ? "items-end" : "items-start")}>
        {blocks.map((block) => (
          <TimelineBlockView key={block.id} block={block} align={isUser ? "right" : "left"} />
        ))}

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-sidebar px-2 py-1 text-[11px] text-app-foreground-soft"
              >
                {attachment.attachmentType === "image" ? (
                  <ImageIcon className="size-3.5 text-app-project" strokeWidth={1.8} />
                ) : (
                  <FileText className="size-3.5 text-app-project" strokeWidth={1.8} />
                )}
                {attachment.originalName ?? "Attachment"}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimelineBlockView({
  block,
  align,
}: {
  block: TimelineBlock;
  align: "left" | "right";
}) {
  if (block.kind === "tool") {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-sidebar px-3 py-2 text-[12px] text-app-foreground-soft">
        <TerminalSquare className="size-3.5 text-app-project" strokeWidth={1.8} />
        <span>{block.label}</span>
      </div>
    );
  }

  if (block.kind === "thinking") {
    return (
      <div className="rounded-2xl border border-app-border bg-app-sidebar px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-app-foreground-soft">
          <BrainCircuit className="size-3.5 text-app-accent" strokeWidth={1.8} />
          Thinking
        </div>
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-6 text-app-foreground-soft">
          {block.text}
        </pre>
      </div>
    );
  }

  if (block.kind === "result") {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-base px-3 py-2 text-[11px] text-app-muted">
        <Sparkles className="size-3.5 text-app-project" strokeWidth={1.8} />
        <span>{block.text}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-[14px] leading-7",
        align === "right"
          ? "border-app-border bg-[linear-gradient(180deg,rgba(103,162,255,0.12),rgba(103,162,255,0.04))] text-app-foreground"
          : "border-app-border bg-app-sidebar text-app-foreground-soft",
      )}
    >
      {block.text}
    </div>
  );
}

function getTimelineBlocks(
  message: SessionMessageRecord,
  attachmentIndex: Map<string, SessionAttachmentRecord>,
): TimelineBlock[] {
  if (!message.contentIsJson || !isRecord(message.parsedContent)) {
    return [
      {
        id: `${message.id}:raw`,
        kind: "text",
        text: message.content,
      },
    ];
  }

  const parsed = message.parsedContent;
  const parsedType = typeof parsed.type === "string" ? parsed.type : null;

  if (parsedType === "assistant") {
    const assistantMessage = isRecord(parsed.message) ? parsed.message : null;
    const content = Array.isArray(assistantMessage?.content)
      ? assistantMessage?.content
      : [];
    const blocks = content.flatMap((block, index) =>
      parseAssistantContentBlock(message.id, block, index),
    );

    return blocks.length > 0
      ? blocks
      : [
          {
            id: `${message.id}:assistant-fallback`,
            kind: "text",
            text: message.content,
          },
        ];
  }

  if (parsedType === "result") {
    const usage = isRecord(parsed.usage) ? parsed.usage : null;
    const inputTokens = asNumber(usage?.input_tokens);
    const outputTokens = asNumber(usage?.output_tokens);
    const bits = [
      inputTokens ? `in ${inputTokens.toLocaleString()}` : null,
      outputTokens ? `out ${outputTokens.toLocaleString()}` : null,
    ].filter(Boolean);

    return [
      {
        id: `${message.id}:result`,
        kind: "result",
        text: bits.length > 0 ? `Session result • ${bits.join(" • ")}` : "Session result",
      },
    ];
  }

  if (parsedType === "user") {
    const userMessage = isRecord(parsed.message) ? parsed.message : null;
    const content = Array.isArray(userMessage?.content) ? userMessage?.content : [];
    const text = content
      .map((block) => extractUserBlockText(block, attachmentIndex))
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return [
      {
        id: `${message.id}:user`,
        kind: "text",
        text: text || message.content,
      },
    ];
  }

  return [
    {
      id: `${message.id}:generic`,
      kind: "text",
      text: message.content,
    },
  ];
}

function parseAssistantContentBlock(
  messageId: string,
  block: unknown,
  index: number,
): TimelineBlock[] {
  if (!isRecord(block)) {
    return [];
  }

  if (block.type === "thinking" && typeof block.thinking === "string") {
    return [
      {
        id: `${messageId}:thinking:${index}`,
        kind: "thinking",
        text: block.thinking,
      },
    ];
  }

  if (block.type === "text" && typeof block.text === "string") {
    return [
      {
        id: `${messageId}:text:${index}`,
        kind: "text",
        text: block.text,
      },
    ];
  }

  if (block.type === "tool_use") {
    return [
      {
        id: `${messageId}:tool:${index}`,
        kind: "tool",
        label: describeToolUse(block),
      },
    ];
  }

  return [];
}

function describeToolUse(block: Record<string, unknown>): string {
  const name = typeof block.name === "string" ? block.name : "Tool";
  const input = isRecord(block.input) ? block.input : null;

  if (name === "Read" && input) {
    const filePath = maybeString(input.file_path);
    const offset = asNumber(input.offset);
    const limit = asNumber(input.limit);
    const fileName = filePath ? basename(filePath) : "file";
    const lineText = limit ? `Read ${limit} lines` : "Read file";
    const offsetText = offset ? ` from line ${offset}` : "";
    return `${lineText} ${fileName}${offsetText}`;
  }

  if (name === "Edit" && input) {
    const filePath = maybeString(input.file_path);
    return `Edit ${filePath ? basename(filePath) : "file"}`;
  }

  if (name === "Bash" && input) {
    const command = maybeString(input.command);
    return command ? `Run ${command}` : "Run shell command";
  }

  if (name === "Task" && input) {
    const description = maybeString(input.description);
    const prompt = maybeString(input.prompt);
    return description ?? prompt ?? "Spawn task";
  }

  return name;
}

function extractUserBlockText(
  block: unknown,
  attachmentIndex: Map<string, SessionAttachmentRecord>,
): string | null {
  if (!isRecord(block)) {
    return null;
  }

  if (block.type === "text" && typeof block.text === "string") {
    return block.text;
  }

  if (block.type === "tool_result" && typeof block.content === "string") {
    return block.content;
  }

  if (block.type === "tool_use" && typeof block.name === "string") {
    return describeToolUse(block);
  }

  if (block.type === "image" || block.type === "file") {
    const attachmentId =
      maybeString(block.attachment_id) ?? maybeString(block.id) ?? maybeString(block.file_id);
    const attachment = attachmentId ? attachmentIndex.get(attachmentId) : null;
    return attachment?.originalName ?? null;
  }

  return null;
}

function displaySessionTitle(session: WorkspaceSessionSummary): string {
  if (session.title && session.title !== "Untitled") {
    return session.title;
  }

  return session.agentType === "codex" ? "Codex session" : "Claude session";
}

function humanizeStatus(status: string): string {
  if (!status) {
    return "Unknown";
  }

  return status
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || value;
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
