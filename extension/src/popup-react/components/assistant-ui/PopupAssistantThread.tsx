import {
  AssistantRuntimeProvider,
  ChainOfThoughtPrimitive,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
  type MessageStatus,
  type ReasoningMessagePartProps,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { History, RotateCcw, Square } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";

import type {
  KimiChatToolCallEntry,
  KimiChatTranscriptEntry,
} from "../../../types/acp-kimi.js";
import { renderMarkdownStream } from "../../../popup/markdown-stream.js";
import { cn } from "../../lib/utils.js";
import { Button, buttonVariants } from "../ui/button.js";

const popupMessageParts = {
  Text: function PopupMessageText() {
    const message = useAuiState((state) => state.message);
    const custom = normalizeCustomMetadata(message.metadata.custom);

    if (custom.markdownHtml) {
      return (
        <div className="grid gap-2">
          <div
            className="text-sm leading-6 text-slate-900 [&_p]:m-0 [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:px-3 [&_pre]:py-3 [&_pre]:text-xs [&_pre]:leading-5 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_code]:font-mono [&_p_code]:rounded-md [&_p_code]:bg-slate-100 [&_p_code]:px-1.5 [&_p_code]:py-0.5 [&_p_code]:text-[0.9em] [&_a]:text-blue-600 [&_a]:hover:underline [&_strong]:font-semibold [&_em]:italic"
            dangerouslySetInnerHTML={{ __html: custom.markdownHtml }}
          />
          <MessagePartPrimitive.InProgress>
            <span className="font-mono text-slate-400"> {"\u25cf"}</span>
          </MessagePartPrimitive.InProgress>
        </div>
      );
    }

    return (
      <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">
        <MessagePartPrimitive.Text component="span" />
        <MessagePartPrimitive.InProgress>
          <span className="font-mono text-slate-400"> {"\u25cf"}</span>
        </MessagePartPrimitive.InProgress>
      </p>
    );
  },
  ChainOfThought: PopupAssistantChainOfThought,
};

const popupChainOfThoughtParts = {
  Layout: function PopupChainOfThoughtLayout({
    children,
  }: {
    children?: ReactNode;
  }) {
    return (
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/85 p-3 text-xs text-slate-600">
        {children}
      </div>
    );
  },
  Reasoning: function PopupReasoningPart(props: ReasoningMessagePartProps) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2">
        <p className="m-0 whitespace-pre-wrap break-words leading-5 text-slate-700">
          {props.text}
        </p>
      </div>
    );
  },
  tools: {
    Fallback: PopupToolCallPart,
  },
};

interface PopupAssistantThreadProps {
  busy: boolean;
  draftMessage: string;
  sessionId: string | null;
  transcript: KimiChatTranscriptEntry[];
  historyOpen: boolean;
  onDraftMessageChange: (value: string) => void;
  onSendMessage: (value: string) => Promise<void> | void;
  onStopGeneration: () => void;
  onResetSession: () => void;
  onToggleHistory: () => void;
}

export function PopupAssistantThread({
  busy,
  draftMessage,
  sessionId,
  transcript,
  historyOpen,
  onDraftMessageChange,
  onSendMessage,
  onStopGeneration,
  onResetSession,
  onToggleHistory,
}: PopupAssistantThreadProps) {
  const adapter = useMemo<ExternalStoreAdapter<KimiChatTranscriptEntry>>(
    () => ({
      isRunning: busy,
      messages: transcript,
      convertMessage: (message, index) => convertTranscriptEntry(message, index, transcript, busy),
      onNew: async (message) => {
        const nextMessage = extractMessageText(message);
        if (!nextMessage) {
          return;
        }

        await onSendMessage(nextMessage);
      },
      onCancel: async () => {
        onStopGeneration();
      },
    }),
    [busy, onSendMessage, onStopGeneration, transcript],
  );
  const runtime = useExternalStoreRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root
        className="flex min-h-0 flex-col gap-2 rounded-[22px] border border-slate-200/80 bg-white/92 p-3 shadow-sm"
        data-testid="assistant-ui-thread"
      >
        <div className="flex items-center justify-between gap-1 px-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Session: {sessionId || "未创建"}</span>
            <span>{busy ? "生成中…" : "空闲"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onToggleHistory}
              aria-label={historyOpen ? "关闭历史" : "历史"}
              title={historyOpen ? "关闭历史" : "历史"}
            >
              <History size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onResetSession}
              aria-label="新会话"
              title="新会话"
            >
              <RotateCcw size={14} />
            </Button>
            {busy ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                onClick={onStopGeneration}
                aria-label="停止"
                title="停止"
              >
                <Square size={14} />
              </Button>
            ) : null}
          </div>
        </div>

        <ThreadPrimitive.Viewport className="flex max-h-[320px] min-h-[180px] flex-col gap-3 overflow-y-auto pr-1">
          <ThreadPrimitive.Empty>
            <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/70 px-4 py-5 text-sm text-slate-600">
              <p className="m-0 font-semibold text-slate-900">还没有消息</p>
              <p className="mt-2 mb-0">
                新会话会从这里开始，后续可以直接基于当前页面上下文继续对话。
              </p>
            </div>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages>
            {() => <PopupAssistantMessage />}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>

        <div className="h-px bg-slate-200/80" />

        <PopupAssistantComposer
          draftMessage={draftMessage}
          onDraftMessageChange={onDraftMessageChange}
        />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function PopupAssistantMessage() {
  const message = useAuiState((state) => state.message);
  const custom = normalizeCustomMetadata(message.metadata.custom);

  if (custom.kind === "status") {
    const text = typeof message.content === "string" ? message.content : "";
    return (
      <div className="py-1.5 text-center text-[11px] text-slate-400">
        {text}
      </div>
    );
  }

  const roleClassName =
    message.role === "assistant"
      ? "border-blue-200/70 bg-blue-50/75"
      : message.role === "user"
        ? "border-slate-200 bg-white"
        : "border-slate-200/70 bg-slate-50/80";

  return (
    <MessagePrimitive.Root className={cn("rounded-2xl border px-4 py-3 shadow-sm", roleClassName)}>
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        <span>{resolveMessageLabel(message.role, custom.kind, custom.label)}</span>
        {message.role === "assistant" ? (
          <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] tracking-normal text-slate-600">
            {resolveMessageStatusLabel(message.status)}
          </span>
        ) : null}
      </div>

      {custom.kind === "raw" && custom.raw ? (
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 px-3 py-3 text-xs leading-5 text-slate-100">
          {custom.raw}
        </pre>
      ) : (
        <MessagePrimitive.Parts
          components={popupMessageParts}
          unstable_showEmptyOnNonTextEnd={false}
        />
      )}
    </MessagePrimitive.Root>
  );
}

function PopupAssistantComposer({
  draftMessage,
  onDraftMessageChange,
}: {
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
}) {
  const aui = useAui();
  const composerText = useAuiState((state) => state.composer.text);

  useEffect(() => {
    if (aui.composer().getState().text !== draftMessage) {
      aui.composer().setText(draftMessage);
    }
  }, [aui, draftMessage]);

  useEffect(() => {
    if (composerText !== draftMessage) {
      onDraftMessageChange(composerText);
    }
  }, [composerText, draftMessage, onDraftMessageChange]);

  return (
    <ComposerPrimitive.Root
      className="grid gap-3"
      data-testid="assistant-ui-composer"
    >
      <ComposerPrimitive.Input
        aria-label="发送消息"
        className="min-h-[92px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200"
        placeholder="输入一条消息"
        submitMode="enter"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-xs text-slate-500">Enter 发送，Shift+Enter 换行</p>
        <ComposerPrimitive.Send
          className={cn(buttonVariants({ size: "sm" }), "rounded-xl px-4")}
        >
          发送
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}

function convertTranscriptEntry(
  entry: KimiChatTranscriptEntry,
  index: number,
  transcript: KimiChatTranscriptEntry[],
  busy: boolean,
): ThreadMessageLike {
  const role = resolveMessageRole(entry.kind);
  const isRunningAssistant =
    busy &&
    entry.kind === "assistant" &&
    findLastAssistantEntry(transcript)?.id === entry.id;

  const hasText = entry.kind !== "raw" && entry.text && entry.text.trim().length > 0;
  const markdownHtml = hasText ? renderMarkdownStream(entry.text || "") : undefined;

  return {
    id: entry.id,
    role,
    content: buildTranscriptContent(entry),
    status:
      role === "assistant"
        ? isRunningAssistant
          ? { type: "running" }
          : { type: "complete", reason: "stop" }
        : undefined,
    metadata: {
      custom: {
        kind: entry.kind,
        label: entry.label,
        markdownHtml,
        raw: entry.raw,
      },
    },
  };
}

function buildTranscriptContent(entry: KimiChatTranscriptEntry): ThreadMessageLike["content"] {
  if (entry.kind === "raw") {
    return entry.raw || entry.text || "";
  }

  const parts: Array<Exclude<ThreadMessageLike["content"], string>[number]> = [];

  if (entry.text) {
    parts.push({
      type: "text",
      text: entry.text,
    });
  }

  if (entry.kind === "assistant") {
    for (const thought of entry.thoughts ?? []) {
      if (!thought.text.trim()) {
        continue;
      }

      parts.push({
        type: "reasoning",
        text: thought.text,
      });
    }

    for (const toolCall of entry.toolCalls ?? []) {
      parts.push(createToolCallPart(toolCall));
    }
  }

  return parts.length > 0 ? parts : "";
}

function createToolCallPart(
  toolCall: KimiChatToolCallEntry,
): Extract<Exclude<ThreadMessageLike["content"], string>[number], { type: "tool-call" }> {
  const artifact = {
    title: toolCall.title,
    detail: toolCall.detail,
    status: toolCall.status ?? undefined,
  } satisfies PopupToolCallArtifact;
  const args = {
    title: toolCall.title,
    detail: toolCall.detail ?? null,
    status: toolCall.status ?? null,
  };

  return {
    type: "tool-call",
    toolCallId: toolCall.id,
    toolName: toolCall.title.trim() || `tool-${toolCall.id}`,
    args,
    argsText: JSON.stringify(args),
    artifact,
    ...(toolCall.status === "completed" || toolCall.status === "failed"
      ? { result: { detail: toolCall.detail ?? null } }
      : {}),
    ...(toolCall.status === "failed" ? { isError: true } : {}),
  };
}

function findLastAssistantEntry(transcript: KimiChatTranscriptEntry[]): KimiChatTranscriptEntry | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index];
    if (entry?.kind === "assistant") {
      return entry;
    }
  }

  return null;
}

function extractMessageText(message: AppendMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function resolveMessageRole(kind: KimiChatTranscriptEntry["kind"]): ThreadMessageLike["role"] {
  switch (kind) {
    case "assistant":
      return "assistant";
    case "user":
      return "user";
    case "status":
    case "raw":
    default:
      return "system";
  }
}

function resolveMessageLabel(
  role: ThreadMessageLike["role"],
  kind: KimiChatTranscriptEntry["kind"] | undefined,
  label: string | undefined,
): string {
  if (kind === "raw") {
    return label ? `原始事件 · ${label}` : "原始事件";
  }

  if (kind === "status") {
    return label ? `状态 · ${label}` : "状态";
  }

  switch (role) {
    case "assistant":
      return "Kimi";
    case "user":
      return "你";
    case "system":
    default:
      return "系统";
  }
}

function resolveMessageStatusLabel(status?: MessageStatus): string {
  if (!status) {
    return "已完成";
  }

  switch (status.type) {
    case "running":
      return "生成中";
    case "complete":
      return "已完成";
    case "requires-action":
      return "待处理";
    case "incomplete":
      return status.reason === "cancelled" ? "已停止" : "未完成";
    default:
      return "已完成";
  }
}

function resolveToolStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "in_progress":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function resolvePartStatusLabel(status?: { type: string; reason?: string }): string {
  if (!status) {
    return "已完成";
  }

  switch (status.type) {
    case "running":
      return "进行中";
    case "requires-action":
      return "待处理";
    case "incomplete":
      return status.reason === "cancelled" ? "已停止" : "未完成";
    case "complete":
    default:
      return "已完成";
  }
}

function PopupAssistantChainOfThought() {
  const chainOfThought = useAuiState((state) => state.chainOfThought);
  const messageStatus = useAuiState((state) => state.message.status);
  const thoughtCount = chainOfThought.parts.filter((part) => part.type === "reasoning").length;
  const toolCount = chainOfThought.parts.filter((part) => part.type === "tool-call").length;
  const statusLabel = resolveChainOfThoughtStatusLabel(
    chainOfThought.parts,
    chainOfThought.status,
    messageStatus,
  );

  return (
    <ChainOfThoughtPrimitive.Root className="mt-3 grid gap-2">
      <ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-100/90">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">思考过程</div>
          <div className="text-[11px] text-slate-500">
            {formatChainOfThoughtSummary(thoughtCount, toolCount)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600">
            {statusLabel}
          </span>
          <span className="text-[11px] text-slate-500">
            {chainOfThought.collapsed ? "展开" : "收起"}
          </span>
        </div>
      </ChainOfThoughtPrimitive.AccordionTrigger>

      {!chainOfThought.collapsed ? (
        <ChainOfThoughtPrimitive.Parts components={popupChainOfThoughtParts} />
      ) : null}
    </ChainOfThoughtPrimitive.Root>
  );
}

function PopupToolCallPart(props: ToolCallMessagePartProps) {
  const artifact = normalizeToolCallArtifact(props.artifact);
  const title = artifact.title || props.toolName;
  const detail = artifact.detail;
  const statusLabel = artifact.status
    ? resolveToolStatusLabel(artifact.status)
    : resolvePartStatusLabel(props.status);

  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-900">{title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
          {statusLabel}
        </span>
      </div>
      {detail ? <div className="mt-1 text-slate-500">{detail}</div> : null}
    </div>
  );
}

function resolveChainOfThoughtStatusLabel(
  parts: ReadonlyArray<{
    type: string;
    artifact?: unknown;
  }>,
  fallbackStatus?: {
    type: string;
    reason?: string;
  },
  messageStatus?: {
    type: string;
    reason?: string;
  },
): string {
  const toolStatuses = parts
    .filter(
      (part): part is {
        type: "tool-call";
        artifact?: unknown;
      } => part.type === "tool-call",
    )
    .map((part) => normalizeToolCallArtifact(part.artifact).status)
    .filter((status): status is NonNullable<PopupToolCallArtifact["status"]> => Boolean(status));

  if (toolStatuses.includes("failed")) {
    return resolveToolStatusLabel("failed");
  }

  if (toolStatuses.includes("in_progress")) {
    return resolveToolStatusLabel("in_progress");
  }

  if (toolStatuses.includes("pending")) {
    return resolveToolStatusLabel("pending");
  }

  if (messageStatus?.type === "running") {
    return resolvePartStatusLabel(messageStatus);
  }

  if (toolStatuses.includes("completed")) {
    return resolveToolStatusLabel("completed");
  }

  return resolvePartStatusLabel(fallbackStatus);
}

function formatChainOfThoughtSummary(thoughtCount: number, toolCount: number): string {
  const segments: string[] = [];

  if (thoughtCount > 0) {
    segments.push(`${thoughtCount} 条思路`);
  }

  if (toolCount > 0) {
    segments.push(`${toolCount} 个工具调用`);
  }

  return segments.length > 0 ? segments.join(" · ") : "无额外推理";
}

interface PopupToolCallArtifact {
  title?: string;
  detail?: string;
  status?: KimiChatToolCallEntry["status"];
}

function normalizeToolCallArtifact(artifact: unknown): PopupToolCallArtifact {
  if (!artifact || typeof artifact !== "object") {
    return {};
  }

  return {
    title: typeof (artifact as PopupToolCallArtifact).title === "string"
      ? (artifact as PopupToolCallArtifact).title
      : undefined,
    detail: typeof (artifact as PopupToolCallArtifact).detail === "string"
      ? (artifact as PopupToolCallArtifact).detail
      : undefined,
    status: typeof (artifact as PopupToolCallArtifact).status === "string"
      ? (artifact as PopupToolCallArtifact).status
      : undefined,
  };
}

function normalizeCustomMetadata(custom: Record<string, unknown> | undefined): {
  kind?: KimiChatTranscriptEntry["kind"];
  label?: string;
  markdownHtml?: string;
  raw?: string;
} {
  return {
    kind:
      custom && typeof custom.kind === "string"
        ? (custom.kind as KimiChatTranscriptEntry["kind"])
        : undefined,
    label: custom && typeof custom.label === "string" ? custom.label : undefined,
    markdownHtml:
      custom && typeof custom.markdownHtml === "string" ? custom.markdownHtml : undefined,
    raw: custom && typeof custom.raw === "string" ? custom.raw : undefined,
  };
}
