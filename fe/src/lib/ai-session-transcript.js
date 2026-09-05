let nextMessageId = 0;

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

function getOrCreateAssistant(messages, messageId) {
  const normalizedMessageId = normalizeMessageId(messageId);
  const entryIndex = normalizedMessageId
    ? messages.findIndex((entry) => entry.kind === "assistant" && entry.messageId === normalizedMessageId)
    : messages.at(-1)?.kind === "assistant"
      ? messages.length - 1
      : -1;
  if (entryIndex !== -1) return { messages, entryIndex };
  return {
    messages: [...messages, message("assistant", "", { messageId: normalizedMessageId, thoughts: [], toolCalls: [] })],
    entryIndex: messages.length,
  };
}

function updateAssistant(messages, messageId, update) {
  const target = getOrCreateAssistant(messages, messageId);
  const next = [...target.messages];
  next[target.entryIndex] = update(next[target.entryIndex]);
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
  if (event.event === "done") {
    return [...messages, message("status", "本轮 AI 回复已完成")];
  }
  if (event.event !== "acp.session.update") return messages;

  const update = event.data?.update;
  if (!update || typeof update !== "object" || typeof update.sessionUpdate !== "string") return messages;
  const text = textFromContent(update.content);

  if (update.sessionUpdate === "user_message_chunk" && text) {
    const userText = displayUserText(text);
    const lastMessage = messages.at(-1);
    if (lastMessage?.kind === "user") {
      return [...messages.slice(0, -1), { ...lastMessage, text: `${lastMessage.text}${userText}` }];
    }
    return [...messages, message("user", userText, { messageId: normalizeMessageId(update.messageId) })];
  }
  if (update.sessionUpdate === "agent_message_chunk" && text) {
    return updateAssistant(messages, update.messageId, (entry) => ({ ...entry, text: `${entry.text}${text}` }));
  }
  if (update.sessionUpdate === "agent_thought_chunk" && text) {
    return updateAssistant(messages, update.messageId, (entry) => {
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
    return updateAssistant(messages, null, (entry) => ({
      ...entry,
      toolCalls: updateToolCall(entry.toolCalls || [], update),
    }));
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
