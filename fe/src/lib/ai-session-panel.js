import { aiSessionStatusAfterEvent, appendAiSessionEvent, createAiUserMessage, transcriptFromAiSessionEvents } from "./ai-session-transcript.js";

export const isAiSessionRunning = (drawer) => ["generating", "waiting_permission", "stopping"].includes(drawer?.status);
export const aiRunStatusLabel = (status) => ({ running: "运行中", waiting_permission: "待确认", stopping: "正在停止", completed: "已完成", failed: "失败", cancelled: "已停止" })[status] || "";

export function drawerFromAiSessionSnapshot(current, loaded) {
  const runStatus = loaded.runStatus ?? current.runStatus;
  const failed = runStatus === "failed" || runStatus === "cancelled";
  return {
    ...current, ...loaded,
    status: ({ running: "generating", waiting_permission: "waiting_permission", stopping: "stopping", failed: "error", cancelled: "cancelled" })[runStatus] || "ready",
    messages: transcriptFromAiSessionEvents(loaded.events).map((entry, index) => ({ ...entry, id: `${loaded.sessionId}-${entry.kind}-${entry.permission?.requestId || entry.messageId || index}` })),
    verificationStatus: failed && (loaded.actionKey || current.actionKey) ? "unverified" : "verified",
    error: failed ? loaded.errorMessage || current.errorMessage || "本轮执行未完成。" : "",
    connectionError: "",
  };
}

// Owns the displayed panel only. Closing detaches the view; the server owns
// execution. A generation token prevents an old response reopening/replacing it.
export function createAiSessionPanel({ load, stream, stop, onChange = () => {}, pollMs = 1000 }) {
  let drawer = null;
  let version = 0;
  let timer;
  let disposed = false;
  const listeners = new Set();
  const connections = new Map();
  const detachAccepted = () => {
    for (const [connection, accepted] of connections) if (accepted) connection.abort();
  };
  const update = (next) => {
    if (disposed) return;
    drawer = typeof next === "function" ? next(drawer) : next;
    for (const listener of listeners) listener();
  };
  const active = (token) => !disposed && version === token;
  const changed = () => { if (!disposed) void Promise.resolve(onChange()).catch(() => {}); };
  const schedule = (token) => {
    if (!active(token)) return;
    clearTimeout(timer);
    if (isAiSessionRunning(drawer)) timer = setTimeout(() => void reload(token), pollMs);
  };
  async function reload(token) {
    if (!active(token) || !drawer) return;
    try {
      const loaded = await load(drawer.sessionId);
      if (!active(token)) return;
      update((current) => drawerFromAiSessionSnapshot(current, loaded));
      if (!isAiSessionRunning(drawer)) changed();
    } catch (error) {
      if (!active(token)) return;
      if (error.code === "AI_RUN_NOT_FOUND" || error.code === "SESSION_NOT_FOUND" || error.code === "SESSION_FORBIDDEN" || error.code === "WORKSPACE_ACCESS_DENIED") {
        update((current) => ({ ...current, status: "error", error: error.message }));
      } else {
        update((current) => ({ ...current, connectionError: "暂时无法连接，正在重新加载进度…" }));
      }
    }
    schedule(token);
  }
  return {
    activate() { disposed = false; },
    getSnapshot: () => drawer,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update,
    close() { version += 1; clearTimeout(timer); detachAccepted(); update(null); changed(); },
    dispose() {
      disposed = true; version += 1; clearTimeout(timer);
      for (const connection of connections.keys()) connection.abort();
      connections.clear(); listeners.clear();
    },
    async open(session, extra = {}) {
      const token = ++version;
      clearTimeout(timer);
      detachAccepted();
      update({ ...session, ...extra, status: "loading", messages: [], error: "", lastMessage: "" });
      try {
        const loaded = await load(session.sessionId);
        if (!active(token)) return;
        update((current) => drawerFromAiSessionSnapshot(current, loaded));
        schedule(token);
      } catch (error) {
        if (active(token)) update((current) => ({ ...current, status: "error", error: error.message || "AI Session 无法打开。" }));
      }
    },
    async start({ message, sessionId, title, actionKey, oneShot = false }) {
      const trimmed = message.trim();
      if (!trimmed) return;
      const previous = sessionId && drawer?.sessionId === sessionId ? drawer : null;
      const token = ++version;
      clearTimeout(timer);
      detachAccepted();
      const abort = new AbortController();
      connections.set(abort, false);
      update({ ...previous, sessionId: sessionId || null, title: title || trimmed,
        actionKey: actionKey || previous?.actionKey, oneShot,
        status: "generating", runStatus: "running", runId: null,
        verificationStatus: actionKey ? "pending" : previous?.verificationStatus || "verified",
        messages: [...(previous?.messages || []), createAiUserMessage(trimmed)], error: "", lastMessage: trimmed,
      });
      try {
        await stream({ message: trimmed, sessionId, actionKey, actionRunId: crypto.randomUUID(), signal: abort.signal,
          onEvent(event) {
            if (event.event === "run.started" || event.event === "session.created") changed();
            if (event.event === "run.started") {
              connections.set(abort, true);
              if (!active(token)) abort.abort();
            }
            if (!active(token)) return;
            update((current) => ({ ...current,
              ...(event.event === "run.started" ? event.data : {}),
              sessionId: event.event === "session.created" ? event.data.sessionId : event.event === "run.started" ? event.data.sessionId : current.sessionId,
              effectDraft: event.event === "effect.draft.created" ? { ...event.data, payload: null } : current.effectDraft,
              status: aiSessionStatusAfterEvent(current.status, event),
              runStatus: event.event === "done" ? "completed" : current.runStatus,
              verificationStatus: event.event === "done" ? "verified" : current.verificationStatus,
              messages: appendAiSessionEvent(current.messages, event),
            }));
          },
        });
      } catch (error) {
        if (active(token)) {
          if (drawer?.runId) await reload(token);
          else update((current) => ({ ...current, status: "error", verificationStatus: "unverified", error: error.message || "AI Session 启动失败。" }));
        }
      } finally {
        connections.delete(abort);
        changed();
        schedule(token);
      }
    },
    async stop() {
      if (!drawer?.runId || !isAiSessionRunning(drawer) || drawer.status === "stopping") return;
      const token = ++version;
      clearTimeout(timer);
      detachAccepted();
      try {
        const loaded = await stop(drawer.sessionId, drawer.runId);
        if (!active(token)) return;
        update((current) => drawerFromAiSessionSnapshot(current, loaded));
        schedule(token);
      } catch (error) {
        if (active(token)) {
          update((current) => ({ ...current, connectionError: error.message || "停止请求失败，请重试。" }));
          schedule(token);
        }
      }
    },
  };
}
