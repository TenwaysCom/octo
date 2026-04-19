import {
  AssistantRuntimeProvider,
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
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useEffect, useMemo } from "react";

import type {
  KimiChatThoughtEntry,
  KimiChatToolCallEntry,
  KimiChatTranscriptEntry,
} from "../../../types/acp-kimi.js";
import { renderMarkdownStream } from "../../../popup/markdown-stream.js";
import { cn } from "../../lib/utils.js";
import { buttonVariants } from "../ui/button.js";

const popupMessageParts = {
  Text: function PopupMessageText() {
    return (
      <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">
        <MessagePartPrimitive.Text component="span" />
        <MessagePartPrimitive.InProgress>
          <span className="font-mono text-slate-400"> {"\u25cf"}</span>
        </MessagePartPrimitive.InProgress>
      </p>
    );
  },
};

interface PopupAssistantThreadProps {
  busy: boolean;
  draftMessage: string;
  sessionId: string | null;
  transcript: KimiChatTranscriptEntry[];
  onDraftMessageChange: (value: string) => void;
  onSendMessage: (value: string) => Promise<void> | void;
  onStopGeneration: () => void;
}

export function PopupAssistantThread({
  busy,
  draftMessage,
  sessionId,
  transcript,
  onDraftMessageChange,
  onSendMessage,
  onStopGeneration,
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
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">
            Session: {sessionId || "未创建"}
          </span>
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">
            状态: {busy ? "生成中" : "空闲"}
          </span>
        </div>

        <ThreadPrimitive.Root
          className="flex min-h-0 flex-col gap-3 rounded-[22px] border border-slate-200/80 bg-white/92 p-3 shadow-sm"
          data-testid="assistant-ui-thread"
        >
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
      </div>
    </AssistantRuntimeProvider>
  );
}

function PopupAssistantMessage() {
  const message = useAuiState((state) => state.message);
  const custom = normalizeCustomMetadata(message.metadata.custom);
  const roleClassName =
    message.role === "assistant"
      ? "border-blue-200/70 bg-blue-50/75"
      : message.role === "user"
        ? "border-slate-200 bg-white"
        : "border-slate-200/70 bg-slate-50/80";
  const showAssistantDetails =
    message.role === "assistant" &&
    (custom.thoughts.length > 0 || custom.toolCalls.length > 0);

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
      ) : message.role === "assistant" && custom.markdownHtml ? (
        <div className="grid gap-2">
          <div
            className="text-sm leading-6 text-slate-900 [&_p]:m-0 [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:px-3 [&_pre]:py-3 [&_pre]:text-xs [&_pre]:leading-5 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_code]:font-mono [&_p_code]:rounded-md [&_p_code]:bg-slate-100 [&_p_code]:px-1.5 [&_p_code]:py-0.5 [&_p_code]:text-[0.9em]"
            dangerouslySetInnerHTML={{ __html: custom.markdownHtml }}
          />
          {message.status?.type === "running" ? (
            <span className="font-mono text-slate-400"> {"\u25cf"}</span>
          ) : null}
        </div>
      ) : (
        <MessagePrimitive.Parts components={popupMessageParts} />
      )}

      {showAssistantDetails ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/85 p-3 text-xs text-slate-600">
          {custom.thoughts.length > 0 ? (
            <section className="grid gap-2">
              <div className="font-semibold text-slate-900">思路</div>
              <ul className="m-0 grid gap-1 pl-4">
                {custom.thoughts.map((thought) => (
                  <li key={thought.id}>{thought.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {custom.toolCalls.length > 0 ? (
            <section className="grid gap-2">
              <div className="font-semibold text-slate-900">工具</div>
              <ul className="m-0 grid gap-2 pl-0">
                {custom.toolCalls.map((toolCall) => (
                  <li
                    key={toolCall.id}
                    className="list-none rounded-lg border border-slate-200 bg-white/90 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900">{toolCall.title}</span>
                      {toolCall.status ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          {resolveToolStatusLabel(toolCall.status)}
                        </span>
                      ) : null}
                    </div>
                    {toolCall.detail ? (
                      <div className="mt-1 text-slate-500">{toolCall.detail}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
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

  return {
    id: entry.id,
    role,
    content: entry.kind === "raw" ? entry.raw || entry.text || "" : entry.text || "",
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
        markdownHtml:
          entry.kind === "assistant" && entry.text ? renderMarkdownStream(entry.text) : undefined,
        raw: entry.raw,
        sourceIndex: index,
        thoughts: entry.thoughts ?? [],
        toolCalls: entry.toolCalls ?? [],
      },
    },
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

function normalizeCustomMetadata(custom: Record<string, unknown> | undefined): {
  kind?: KimiChatTranscriptEntry["kind"];
  label?: string;
  markdownHtml?: string;
  raw?: string;
  thoughts: KimiChatThoughtEntry[];
  toolCalls: KimiChatToolCallEntry[];
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
    thoughts: Array.isArray(custom?.thoughts) ? (custom.thoughts as KimiChatThoughtEntry[]) : [],
    toolCalls: Array.isArray(custom?.toolCalls)
      ? (custom.toolCalls as KimiChatToolCallEntry[])
      : [],
  };
}
