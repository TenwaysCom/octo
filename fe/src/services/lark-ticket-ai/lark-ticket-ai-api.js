export { replyAcpPermission } from "../acp/acp-permission-api.js";
import { buildApiUrl } from "../../app/runtime-config.js";

function ticketPath(ticket) {
  return `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/ai-sessions`;
}

function ticketQuery(ticket) {
  return new URLSearchParams({ baseId: ticket.baseId, tableId: ticket.tableId });
}

async function readJson(response) {
  return response.json().catch(() => undefined);
}

function requireSuccess(response, payload, fallbackCode) {
  if (!response.ok || !payload?.ok) {
    throw createApiError(payload?.error?.errorCode || fallbackCode, payload?.error?.errorMessage);
  }
  return payload.data;
}

function createApiError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

export async function listLarkTicketAiSessions({ apiBaseUrl, ticket, fetchImpl = fetch }) {
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, ticketPath(ticket))}?${ticketQuery(ticket)}`, {
    credentials: "include",
  });
  const data = requireSuccess(response, await readJson(response), "AI_SESSION_LIST_FAILED");
  if (!Array.isArray(data?.sessions)) {
    throw createApiError("INVALID_AI_SESSION_LIST", "Invalid AI Session list response.");
  }
  return data.sessions;
}

export async function loadLarkTicketAiSession({ apiBaseUrl, ticket, sessionId, fetchImpl = fetch }) {
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, `${ticketPath(ticket)}/${encodeURIComponent(sessionId)}/load`)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseId: ticket.baseId, tableId: ticket.tableId }),
  });
  const data = requireSuccess(response, await readJson(response), "AI_SESSION_LOAD_FAILED");
  if (typeof data?.sessionId !== "string" || !Array.isArray(data.events)) {
    throw createApiError("INVALID_AI_SESSION_LOAD", "Invalid AI Session detail response.");
  }
  return data;
}

export async function stopLarkTicketAiSession({ apiBaseUrl, ticket, sessionId, runId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, `${ticketPath(ticket)}/${encodeURIComponent(sessionId)}/stop`), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseId: ticket.baseId, tableId: ticket.tableId, runId }),
  });
  return requireSuccess(response, await readJson(response), "AI_SESSION_STOP_FAILED");
}

export async function streamLarkTicketAiSession({
  apiBaseUrl,
  ticket,
  message,
  sessionId,
  actionKey,
  actionRunId,
  onEvent,
  signal,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, ticketPath(ticket)), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      baseId: ticket.baseId,
      tableId: ticket.tableId,
      message,
      ...(sessionId ? { sessionId } : {}),
      ...(actionKey ? { actionKey } : {}),
      ...(actionRunId ? { actionRunId } : {}),
    }),
    signal,
  });
  if (!response.ok) {
    const payload = await readJson(response);
    throw createApiError(payload?.error?.errorCode || "AI_SESSION_START_FAILED", payload?.error?.errorMessage);
  }
  if (!response.body) {
    throw createApiError("AI_SESSION_STREAM_MISSING", "AI Session did not return a stream.");
  }
  await parseEventStream(response.body, onEvent);
}

export async function listLarkTicketEffectDrafts({ apiBaseUrl, ticket, fetchImpl = fetch }) {
  const path = `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/effect-drafts`;
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, path)}?${ticketQuery(ticket)}`, { credentials: "include" });
  const data = requireSuccess(response, await readJson(response), "EFFECT_DRAFT_LIST_FAILED");
  if (!Array.isArray(data?.drafts)) throw createApiError("INVALID_EFFECT_DRAFT_LIST", "Invalid effect draft list response.");
  return data.drafts;
}

export async function confirmLarkTicketEffectDraft({ apiBaseUrl, ticket, draftId, actionRunId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/effect-drafts/${encodeURIComponent(draftId)}/confirm`), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseId: ticket.baseId, tableId: ticket.tableId, actionRunId, confirmed: true }),
  });
  return requireSuccess(response, await readJson(response), "EFFECT_DRAFT_CONFIRM_FAILED");
}

async function parseEventStream(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let completed = false;
  let buffer = "";
  let eventName = "";
  let eventData = "";

  function flush() {
    if (!eventName) return;
    let data;
    try {
      data = JSON.parse(eventData || "{}");
    } catch {
      throw createApiError("AI_SESSION_STREAM_INVALID", "AI Session returned an invalid event.");
    }
    if (eventName === "error") {
      throw createApiError(data.errorCode || "AI_SESSION_FAILED", data.errorMessage);
    }
    if (eventName === "done") completed = true;
    onEvent?.({ event: eventName, data });
    eventName = "";
    eventData = "";
  }

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        flush();
      } else if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        eventData = eventData ? `${eventData}\n${line.slice("data:".length).trim()}` : line.slice("data:".length).trim();
      }
      newlineIndex = buffer.indexOf("\n");
    }
    if (done) break;
  }
  buffer += decoder.decode();
  if (buffer) {
    const line = buffer.replace(/\r$/, "");
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    if (line.startsWith("data:")) eventData = line.slice("data:".length).trim();
  }
  flush();
  if (!completed) throw createApiError("AI_SESSION_STREAM_INTERRUPTED", "连接已中断，请重新打开会话查看任务状态。");
}
