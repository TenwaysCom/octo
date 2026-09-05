import { buildApiUrl } from "../../app/runtime-config.js";

function sprintPath(sprint) {
  return `/web/meegle-sprints/${encodeURIComponent(sprint.sprintId)}/ai-sessions`;
}

function sprintQuery(sprint) {
  return new URLSearchParams({ projectKey: sprint.projectKey });
}

async function readJson(response) {
  return response.json().catch(() => undefined);
}

function createApiError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function requireSuccess(response, payload, fallbackCode) {
  if (!response.ok || !payload?.ok) throw createApiError(payload?.error?.errorCode || fallbackCode, payload?.error?.errorMessage);
  return payload.data;
}

export async function listMeegleSprintAiSessions({ apiBaseUrl, sprint, fetchImpl = fetch }) {
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, sprintPath(sprint))}?${sprintQuery(sprint)}`, { credentials: "include" });
  const data = requireSuccess(response, await readJson(response), "AI_SESSION_LIST_FAILED");
  if (!Array.isArray(data?.sessions)) throw createApiError("INVALID_AI_SESSION_LIST", "Invalid AI Session list response.");
  return data.sessions;
}

export async function loadMeegleSprintAiSession({ apiBaseUrl, sprint, sessionId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, `${sprintPath(sprint)}/${encodeURIComponent(sessionId)}/load`), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectKey: sprint.projectKey }),
  });
  const data = requireSuccess(response, await readJson(response), "AI_SESSION_LOAD_FAILED");
  if (typeof data?.sessionId !== "string" || !Array.isArray(data.events)) throw createApiError("INVALID_AI_SESSION_LOAD", "Invalid AI Session detail response.");
  return data;
}

export async function streamMeegleSprintAiSession({ apiBaseUrl, sprint, message, sessionId, actionKey, actionRunId, onEvent, signal, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, sprintPath(sprint)), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ projectKey: sprint.projectKey, message, ...(sessionId ? { sessionId } : {}), ...(actionKey ? { actionKey } : {}), ...(actionRunId ? { actionRunId } : {}) }), signal,
  });
  if (!response.ok) {
    const payload = await readJson(response);
    throw createApiError(payload?.error?.errorCode || "AI_SESSION_START_FAILED", payload?.error?.errorMessage);
  }
  if (!response.body) throw createApiError("AI_SESSION_STREAM_MISSING", "AI Session did not return a stream.");
  await parseEventStream(response.body, onEvent);
}

async function parseEventStream(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; let eventName = ""; let eventData = "";
  function flush() {
    if (!eventName) return;
    let data;
    try { data = JSON.parse(eventData || "{}"); } catch { throw createApiError("AI_SESSION_STREAM_INVALID", "AI Session returned an invalid event."); }
    if (eventName === "error") throw createApiError(data.errorCode || "AI_SESSION_FAILED", data.errorMessage);
    onEvent?.({ event: eventName, data }); eventName = ""; eventData = "";
  }
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, ""); buffer = buffer.slice(newlineIndex + 1);
      if (!line) flush();
      else if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) eventData = eventData ? `${eventData}\n${line.slice("data:".length).trim()}` : line.slice("data:".length).trim();
      newlineIndex = buffer.indexOf("\n");
    }
    if (done) break;
  }
  flush();
}
