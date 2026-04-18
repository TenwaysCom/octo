import type {
  KimiChatEvent,
  KimiChatRenderState,
  KimiChatSessionUpdate,
  KimiChatToolCallEntry,
  KimiChatTranscriptEntry,
} from "../types/acp-kimi.js";

export function applyKimiChatEvent(
  state: Readonly<KimiChatRenderState>,
  event: KimiChatEvent,
): KimiChatRenderState {
  switch (event.event) {
    case "session.created":
      return {
        ...state,
        sessionId: event.data.sessionId,
        transcript: [
          ...state.transcript,
          createStatusEntry(`会话已创建 · ${event.data.sessionId}`),
        ],
      };
    case "acp.session.update":
      return applySessionUpdate(
        state,
        normalizeSessionUpdateForRendering(event.data.update),
      );
    case "done":
      return {
        ...state,
        activeAssistantEntryId: null,
        transcript: [
          ...state.transcript,
          createStatusEntry(`本轮已完成 · ${event.data.stopReason}`),
        ],
      };
  }
}

function applySessionUpdate(
  state: Readonly<KimiChatRenderState>,
  update: KimiChatSessionUpdate,
): KimiChatRenderState {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return appendAssistantText(
        state,
        update as Extract<KimiChatSessionUpdate, { sessionUpdate: "agent_message_chunk" }>,
      );
    case "agent_thought_chunk":
      return appendAssistantThought(
        state,
        update as Extract<KimiChatSessionUpdate, { sessionUpdate: "agent_thought_chunk" }>,
      );
    case "tool_call": {
      const toolCallUpdate = update as Extract<
        KimiChatSessionUpdate,
        { sessionUpdate: "tool_call" }
      >;

      return upsertAssistantToolCall(state, {
        id: toolCallUpdate.toolCallId,
        title: toolCallUpdate.title,
        status: toolCallUpdate.status,
        detail: summarizeToolLocations(toolCallUpdate.locations),
      });
    }
    case "tool_call_update":
      return updateAssistantToolCall(
        state,
        update as Extract<KimiChatSessionUpdate, { sessionUpdate: "tool_call_update" }>,
      );
    case "plan": {
      const planUpdate = update as Extract<
        KimiChatSessionUpdate,
        { sessionUpdate: "plan" }
      >;

      return {
        ...state,
        transcript: [
          ...state.transcript,
          createStatusEntry(summarizePlan(planUpdate.entries)),
        ],
      };
    }
    case "current_mode_update":
      return {
        ...state,
        transcript: [
          ...state.transcript,
          createStatusEntry(`模式已切换 · ${update.currentModeId}`),
        ],
      };
    case "session_info_update": {
      const summary = summarizeSessionInfo(
        update as Extract<
          KimiChatSessionUpdate,
          { sessionUpdate: "session_info_update" }
        >,
      );

      if (!summary) {
        return state;
      }

      return {
        ...state,
        transcript: [...state.transcript, createStatusEntry(summary)],
      };
    }
    case "user_message_chunk":
      return state;
    default:
      return {
        ...state,
        transcript: [
          ...state.transcript,
          {
            id: createTranscriptEntryId("raw"),
            kind: "raw",
            label: update.sessionUpdate,
            raw: JSON.stringify(update),
          },
        ],
      };
  }
}

function normalizeSessionUpdateForRendering(
  update: KimiChatSessionUpdate | Record<string, unknown>,
): KimiChatSessionUpdate {
  if (
    update &&
    typeof update === "object" &&
    "sessionUpdate" in update &&
    typeof update.sessionUpdate === "string"
  ) {
    return update as KimiChatSessionUpdate;
  }

  if (
    update &&
    typeof update === "object" &&
    "content" in update &&
    typeof update.content === "string"
  ) {
    return {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: update.content,
      },
    };
  }

  return {
    ...update,
    sessionUpdate: "unknown_legacy_update",
  };
}

function appendAssistantText(
  state: Readonly<KimiChatRenderState>,
  update: Extract<KimiChatSessionUpdate, { sessionUpdate: "agent_message_chunk" }>,
): KimiChatRenderState {
  const text = renderContentText(update.content, "回复");
  const assistantEntry = ensureAssistantEntry(state, update.messageId);
  const transcript = [...assistantEntry.transcript];
  const entryIndex = transcript.findIndex((entry) => entry.id === assistantEntry.entryId);

  if (entryIndex === -1) {
    return assistantEntry.state;
  }

  const currentEntry = transcript[entryIndex]!;
  transcript[entryIndex] = {
    ...currentEntry,
    text: `${currentEntry.text ?? ""}${text}`,
  };

  return {
    ...assistantEntry.state,
    transcript,
  };
}

function appendAssistantThought(
  state: Readonly<KimiChatRenderState>,
  update: Extract<KimiChatSessionUpdate, { sessionUpdate: "agent_thought_chunk" }>,
): KimiChatRenderState {
  const text = renderContentText(update.content, "思路");
  const assistantEntry = ensureAssistantEntry(state, update.messageId);
  const transcript = [...assistantEntry.transcript];
  const entryIndex = transcript.findIndex((entry) => entry.id === assistantEntry.entryId);

  if (entryIndex === -1) {
    return assistantEntry.state;
  }

  const currentEntry = transcript[entryIndex]!;
  const thoughts = [...(currentEntry.thoughts ?? [])];
  const lastThought =
    thoughts.length > 0 ? thoughts[thoughts.length - 1] : undefined;

  if (
    lastThought &&
    normalizeMessageId(lastThought.messageId) === normalizeMessageId(update.messageId)
  ) {
    thoughts[thoughts.length - 1] = {
      ...lastThought,
      text: `${lastThought.text}${text}`,
    };
  } else {
    thoughts.push({
      id: createTranscriptEntryId("thought"),
      text,
      messageId: update.messageId,
    });
  }

  transcript[entryIndex] = {
    ...currentEntry,
    thoughts,
  };

  return {
    ...assistantEntry.state,
    transcript,
  };
}

function upsertAssistantToolCall(
  state: Readonly<KimiChatRenderState>,
  toolCall: KimiChatToolCallEntry,
): KimiChatRenderState {
  const assistantEntry = ensureAssistantEntry(state, null);
  const transcript = [...assistantEntry.transcript];
  const entryIndex = transcript.findIndex((entry) => entry.id === assistantEntry.entryId);

  if (entryIndex === -1) {
    return assistantEntry.state;
  }

  const currentEntry = transcript[entryIndex]!;
  const toolCalls = [...(currentEntry.toolCalls ?? [])];
  const existingIndex = toolCalls.findIndex((entry) => entry.id === toolCall.id);

  if (existingIndex === -1) {
    toolCalls.push(toolCall);
  } else {
    toolCalls[existingIndex] = {
      ...toolCalls[existingIndex],
      ...toolCall,
      title: toolCall.title || toolCalls[existingIndex]!.title,
      detail: toolCall.detail ?? toolCalls[existingIndex]!.detail,
      status: toolCall.status ?? toolCalls[existingIndex]!.status,
    };
  }

  transcript[entryIndex] = {
    ...currentEntry,
    toolCalls,
  };

  return {
    ...assistantEntry.state,
    transcript,
  };
}

function updateAssistantToolCall(
  state: Readonly<KimiChatRenderState>,
  update: Extract<KimiChatSessionUpdate, { sessionUpdate: "tool_call_update" }>,
): KimiChatRenderState {
  return upsertAssistantToolCall(state, {
    id: update.toolCallId,
    title: update.title?.trim() || "",
    status: update.status ?? undefined,
    detail: summarizeToolLocations(update.locations ?? undefined),
  });
}

function ensureAssistantEntry(
  state: Readonly<KimiChatRenderState>,
  messageId: string | null | undefined,
): {
  state: KimiChatRenderState;
  transcript: KimiChatTranscriptEntry[];
  entryId: string;
} {
  const currentEntry =
    state.activeAssistantEntryId == null
      ? undefined
      : state.transcript.find((entry) => entry.id === state.activeAssistantEntryId);
  const normalizedMessageId = normalizeMessageId(messageId);

  if (normalizedMessageId) {
    const matchingEntry = state.transcript.find(
      (entry) =>
        entry.kind === "assistant" &&
        normalizeMessageId(entry.messageId) === normalizedMessageId,
    );

    if (matchingEntry) {
      return {
        state: {
          ...state,
        },
        transcript: [...state.transcript],
        entryId: matchingEntry.id,
      };
    }
  }

  if (
    normalizedMessageId == null &&
    currentEntry?.kind === "assistant" &&
    state.activeAssistantEntryId
  ) {
    return {
      state: {
        ...state,
      },
      transcript: [...state.transcript],
      entryId: state.activeAssistantEntryId,
    };
  }

  const entryId = createTranscriptEntryId("assistant");
  const transcript = [
    ...state.transcript,
    {
      id: entryId,
      kind: "assistant",
      text: "",
      messageId: normalizedMessageId ?? undefined,
      thoughts: [],
      toolCalls: [],
    },
  ] satisfies KimiChatTranscriptEntry[];

  return {
    state: {
      ...state,
      activeAssistantEntryId: entryId,
      transcript,
    },
    transcript,
    entryId,
  };
}

function createStatusEntry(text: string): KimiChatTranscriptEntry {
  return {
    id: createTranscriptEntryId("status"),
    kind: "status",
    text,
  };
}

function renderContentText(
  content: { type: string } & Record<string, unknown>,
  label: string,
): string {
  if (content.type === "text" && typeof content.text === "string") {
    return content.text;
  }

  return `[${label}:${content.type}]`;
}

function summarizeToolLocations(
  locations: Array<{ path: string; line?: number | null }> | null | undefined,
): string | undefined {
  if (!locations?.length) {
    return undefined;
  }

  return locations
    .map((location) =>
      location.line == null ? location.path : `${location.path}:${location.line}`,
    )
    .join(", ");
}

function summarizePlan(
  entries: Array<{ status: "pending" | "in_progress" | "completed" }>,
): string {
  const counts = {
    inProgress: 0,
    pending: 0,
    completed: 0,
  };

  for (const entry of entries) {
    if (entry.status === "in_progress") {
      counts.inProgress += 1;
      continue;
    }

    if (entry.status === "pending") {
      counts.pending += 1;
      continue;
    }

    counts.completed += 1;
  }

  return `计划已更新 · ${entries.length} 项（${counts.inProgress} 进行中，${counts.pending} 待开始，${counts.completed} 已完成）`;
}

function summarizeSessionInfo(
  update: Extract<KimiChatSessionUpdate, { sessionUpdate: "session_info_update" }>,
): string | null {
  const parts: string[] = [];

  if (typeof update.title === "string" && update.title.length > 0) {
    parts.push(`标题：${update.title}`);
  }

  if (typeof update.updatedAt === "string" && update.updatedAt.length > 0) {
    parts.push(`时间：${update.updatedAt}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `会话信息已更新 · ${parts.join(" · ")}`;
}

function normalizeMessageId(messageId: string | null | undefined): string | null {
  return typeof messageId === "string" && messageId.length > 0 ? messageId : null;
}

function createTranscriptEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
