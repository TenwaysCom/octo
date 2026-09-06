let nextMessageId = 0;

export function aiSessionStatusAfterEvent(status, event) {
  if (event.event === "acp.permission.requested") return status === "error" ? status : "waiting_permission";
  if (event.event === "acp.permission.resolved") return event.data.status === "approved" && status !== "error" ? "generating" : "error";
  if (status === "error" || status === "waiting_permission") return status;
  if (event.event === "done") return !event.data?.stopReason || event.data.stopReason === "end_turn" ? "ready" : "error";
  return "generating";
}

function message(kind, text, extra = {}) {
  nextMessageId += 1;
  return { id: `ai-message-${Date.now()}-${nextMessageId}`, kind, text, ...extra };
}

function textFromContent(content) {
  if (content && typeof content === "object" && typeof content.text === "string") return content.text;
  if (typeof content === "string") return content;
  return "";
}

function displayUserText(text) {
  const marker = "User request:\n";
  const markerIndex = text.lastIndexOf(marker);
  return markerIndex === -1 ? text : text.slice(markerIndex + marker.length);
}

function normalizeMessageId(value) {
  return typeof value === "string" && value.length ? value : null;
}

function currentTurnStart(messages) {
  return messages.findLastIndex((entry) => entry.kind === "user" || entry.turnComplete) + 1;
}

function getOrCreateAssistant(messages, messageId, kind) {
  const normalizedMessageId = normalizeMessageId(messageId);
  const turnStart = currentTurnStart(messages);
  const entryIndex = messages.findLastIndex((entry, index) => index >= turnStart && entry.kind === "assistant");
  const previous = messages[entryIndex];
  // ACP message IDs are optional and may repeat. Preserve the observable
  // thinking/text -> tools -> next response boundary even without them.
  const startsNextStep = previous && kind !== "tool" && (
    previous.toolCalls.length > 0
    || (kind === "thought" && previous.text)
    || (normalizedMessageId && previous.messageId && normalizedMessageId !== previous.messageId)
  );
  if (previous && !startsNextStep) return { messages, entryIndex };
  return {
    messages: [...messages, message("assistant", "", { messageId: normalizedMessageId, thoughts: [], toolCalls: [] })],
    entryIndex: messages.length,
  };
}

function updateAssistant(messages, messageId, kind, update) {
  const target = getOrCreateAssistant(messages, messageId, kind);
  const next = [...target.messages];
  const entry = next[target.entryIndex];
  next[target.entryIndex] = update({ ...entry, messageId: normalizeMessageId(messageId) ?? entry.messageId });
  return next;
}

function updateToolCall(toolCalls, update) {
  const existingIndex = toolCalls.findIndex((toolCall) => toolCall.id === update.toolCallId);
  const existing = existingIndex === -1 ? undefined : toolCalls[existingIndex];
  const nextToolCall = {
    id: update.toolCallId,
    title: typeof update.title === "string" && update.title.trim() ? update.title : existing?.title || "工具调用",
    status: typeof update.status === "string" ? update.status : existing?.status,
    detail: Array.isArray(update.locations) && update.locations.length
      ? update.locations.map((location) => location.line == null ? location.path : `${location.path}:${location.line}`).join(", ")
      : existing?.detail,
  };
  if (existingIndex === -1) return [...toolCalls, nextToolCall];
  const next = [...toolCalls];
  next[existingIndex] = nextToolCall;
  return next;
}

export function appendAiSessionEvent(messages, event) {
  if (event.event === "acp.permission.requested" || event.event === "acp.permission.resolved") {
    const permission = { ...event.data, status: event.event === "acp.permission.requested" ? "pending" : event.data.status };
    const index = messages.findIndex((entry) => entry.kind === "permission" && entry.permission.requestId === permission.requestId);
    const entry = message("permission", "", { permission });
    if (index === -1) return [...messages, entry];
    return messages.map((current, i) => i === index ? { ...entry, id: current.id } : current);
  }
  if (event.event === "done") {
    const turnStart = messages.findLastIndex((entry) => entry.kind === "user");
    if (messages.slice(turnStart + 1).some((entry) => entry.kind === "permission" && entry.permission.status !== "approved")) return messages;
    if (event.data?.stopReason && event.data.stopReason !== "end_turn") return [...messages, message("status", "本轮 AI 回复已停止", { turnComplete: true })];
    return [...messages, message("status", "本轮 AI 回复已完成", { turnComplete: true })];
  }
  if (event.event !== "acp.session.update") return messages;

  const update = event.data?.update;
  if (!update || typeof update !== "object" || typeof update.sessionUpdate !== "string") return messages;
  const text = textFromContent(update.content);

  if (update.sessionUpdate === "user_message_chunk" && text) {
    const userText = displayUserText(text);
    const lastMessage = messages.at(-1);
    if (lastMessage?.kind === "user" && (lastMessage.messageId ?? null) === normalizeMessageId(update.messageId)) {
      return [...messages.slice(0, -1), { ...lastMessage, text: `${lastMessage.text}${userText}` }];
    }
    return [...messages, message("user", userText, { messageId: normalizeMessageId(update.messageId) })];
  }
  if (update.sessionUpdate === "agent_message_chunk" && text) {
    return updateAssistant(messages, update.messageId, "text", (entry) => ({ ...entry, text: `${entry.text}${text}` }));
  }
  if (update.sessionUpdate === "agent_thought_chunk" && text) {
    return updateAssistant(messages, update.messageId, "thought", (entry) => {
      const thoughts = [...(entry.thoughts || [])];
      const lastThought = thoughts.at(-1);
      if (lastThought && lastThought.messageId === normalizeMessageId(update.messageId)) {
        thoughts[thoughts.length - 1] = { ...lastThought, text: `${lastThought.text}${text}` };
      } else {
        thoughts.push({ id: message("thought", "").id, text, messageId: normalizeMessageId(update.messageId) });
      }
      return { ...entry, thoughts };
    });
  }
  if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
    if (typeof update.toolCallId !== "string" || !update.toolCallId) return messages;
    const turnStart = currentTurnStart(messages);
    const ownerIndex = messages.findLastIndex((entry, index) => index >= turnStart
      && entry.kind === "assistant" && entry.toolCalls.some((toolCall) => toolCall.id === update.toolCallId));
    const applyToolUpdate = (entry) => ({
      ...entry,
      toolCalls: updateToolCall(entry.toolCalls || [], update),
    });
    if (ownerIndex !== -1) return messages.map((entry, index) => index === ownerIndex ? applyToolUpdate(entry) : entry);
    return updateAssistant(messages, null, "tool", applyToolUpdate);
  }
  if (update.sessionUpdate === "plan") {
    return [...messages, message("status", `计划已更新 · ${Array.isArray(update.entries) ? update.entries.length : 0} 项`)];
  }
  return messages;
}

export function transcriptFromAiSessionEvents(events) {
  return events.reduce((messages, event) => appendAiSessionEvent(messages, event), []);
}

export function createAiUserMessage(text) {
  return message("user", text);
}
