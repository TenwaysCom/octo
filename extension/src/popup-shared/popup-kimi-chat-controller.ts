import type {
  KimiChatEvent,
  KimiChatRenderState,
  KimiChatSessionSummary,
  KimiChatTranscriptEntry,
} from "../types/acp-kimi.js";
import type { PopupLogLevel } from "../popup/types.js";
import { applyKimiChatEvent } from "../popup/kimi-chat.js";
import { createKimiChatClient } from "../popup/kimi-chat-client.js";
import {
  deleteKimiChatSession,
  deleteKimiChatTranscriptSnapshot,
  listKimiChatSessions,
  loadKimiChatSession,
  loadKimiChatTranscriptSnapshot,
  renameKimiChatSession,
  saveKimiChatTranscriptSnapshot,
} from "../popup/runtime.js";

type ScheduledFrameHandle = number | ReturnType<typeof globalThis.setTimeout>;

export interface PopupKimiChatStoreLike {
  activePage: string;
  showKimiChat: boolean;
  kimiChatBusy: boolean;
  kimiChatSessionId: string | null;
  kimiChatDraftMessage: string;
  kimiChatActiveAssistantEntryId: string | null;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatHistoryOpen: boolean;
  kimiChatHistoryLoading: boolean;
  kimiChatHistoryItems: KimiChatSessionSummary[];
  settingsForm: {
    SERVER_URL: string;
    larkUserId: string;
  };
  state: {
    identity: {
      larkId: string | null;
      masterUserId: string | null;
    };
  };
}

interface DebugLogPayload {
  source: string;
  level: "info" | "error";
  event: string;
  detail?: Record<string, unknown>;
}

export interface KimiChatControllerDeps<TStore extends PopupKimiChatStoreLike> {
  readStore: () => TStore;
  updateStore: (updater: (previous: TStore) => TStore) => void;
  appendLog: (level: PopupLogLevel, message: string) => void;
  postClientDebugLog: (payload: DebugLogPayload) => Promise<unknown>;
}

export function createKimiChatController<TStore extends PopupKimiChatStoreLike>(
  deps: KimiChatControllerDeps<TStore>,
) {
  const pendingRenderStateRef = { current: null as KimiChatRenderState | null };
  const pendingFlushHandleRef = { current: null as ScheduledFrameHandle | null };
  const activeRequestIdRef = { current: 0 };
  const nextRequestIdRef = { current: 0 };
  const abortControllerRef = { current: null as AbortController | null };

  function readOperatorLarkId(): string | null {
    const current = deps.readStore();
    return current.state.identity.larkId || current.settingsForm.larkUserId || null;
  }

  async function persistSnapshotForState(
    nextState: KimiChatRenderState,
  ): Promise<void> {
    const operatorLarkId = readOperatorLarkId();

    if (!operatorLarkId || !nextState.sessionId || nextState.transcript.length === 0) {
      return;
    }

    await saveKimiChatTranscriptSnapshot({
      operatorLarkId,
      sessionId: nextState.sessionId,
      transcript: nextState.transcript,
      updatedAt: new Date().toISOString(),
    });
  }

  function getRenderState(): KimiChatRenderState {
    const pendingState = pendingRenderStateRef.current;
    if (pendingState) {
      return pendingState;
    }

    const current = deps.readStore();
    return {
      sessionId: current.kimiChatSessionId,
      activeAssistantEntryId: current.kimiChatActiveAssistantEntryId,
      transcript: current.kimiChatTranscript,
    };
  }

  function applyRenderState(nextState: KimiChatRenderState): void {
    deps.updateStore((previous) => ({
      ...previous,
      kimiChatSessionId: nextState.sessionId,
      kimiChatActiveAssistantEntryId: nextState.activeAssistantEntryId,
      kimiChatTranscript: nextState.transcript,
    }));

    void persistSnapshotForState(nextState);
  }

  function flushPendingRenderState(): void {
    pendingFlushHandleRef.current = null;

    if (!pendingRenderStateRef.current) {
      return;
    }

    const nextState = pendingRenderStateRef.current;
    pendingRenderStateRef.current = null;
    applyRenderState(nextState);
  }

  function schedulePendingRenderState(nextState: KimiChatRenderState): void {
    pendingRenderStateRef.current = nextState;

    if (pendingFlushHandleRef.current != null) {
      return;
    }

    pendingFlushHandleRef.current = scheduleAnimationFrame(() => {
      flushPendingRenderState();
    });
  }

  function cancelPendingRenderState(): void {
    const pendingState = pendingRenderStateRef.current;
    if (pendingState?.sessionId) {
      deps.updateStore((previous) => ({
        ...previous,
        kimiChatSessionId: pendingState.sessionId,
      }));
    }

    pendingRenderStateRef.current = null;

    if (pendingFlushHandleRef.current != null) {
      cancelScheduledAnimationFrame(pendingFlushHandleRef.current);
      pendingFlushHandleRef.current = null;
    }
  }

  function appendEvent(event: KimiChatEvent): void {
    schedulePendingRenderState(applyKimiChatEvent(getRenderState(), event));
  }

  function appendStatus(text: string): void {
    flushPendingRenderState();

    deps.updateStore((previous) => ({
      ...previous,
      kimiChatTranscript: [
        ...previous.kimiChatTranscript,
        {
          id: createTranscriptEntryId("status"),
          kind: "status",
          text,
        },
      ],
    }));

    const current = deps.readStore();
    void persistSnapshotForState({
      sessionId: current.kimiChatSessionId,
      activeAssistantEntryId: current.kimiChatActiveAssistantEntryId,
      transcript: current.kimiChatTranscript,
    });
  }

  function clearActiveRequest(): void {
    activeRequestIdRef.current = 0;
    abortControllerRef.current = null;
  }

  async function buildHistoryItems(
    operatorLarkId: string,
    sessions: KimiChatSessionSummary[],
  ): Promise<KimiChatSessionSummary[]> {
    return Promise.all(
      sessions.map(async (session) => {
        const snapshot = await loadKimiChatTranscriptSnapshot({
          operatorLarkId,
          sessionId: session.sessionId,
        });
        const transcript = Array.isArray(snapshot?.transcript) ? snapshot.transcript : [];
        const fallbackTitle = deriveKimiChatSessionTitle(transcript);

        return {
          ...session,
          title: shouldUseFallbackSessionTitle(session.title)
            ? fallbackTitle || session.title || session.sessionId
            : session.title,
          updatedAt: session.updatedAt ?? snapshot?.updatedAt ?? null,
        };
      }),
    );
  }

  function resetSession(): void {
    const current = deps.readStore();
    void deps.postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "acp.session.reset",
      detail: {
        activePage: current.activePage,
        hadSessionId: Boolean(current.kimiChatSessionId),
        transcriptLength: current.kimiChatTranscript.length,
      },
    });

    cancelPendingRenderState();
    abortControllerRef.current?.abort();
    clearActiveRequest();

    deps.updateStore((previous) => ({
      ...previous,
      kimiChatBusy: false,
      kimiChatSessionId: null,
      kimiChatDraftMessage: "",
      kimiChatActiveAssistantEntryId: null,
      kimiChatTranscript: [],
    }));
  }

  function stopGeneration(): void {
    if (!deps.readStore().kimiChatBusy) {
      return;
    }

    flushPendingRenderState();
    abortControllerRef.current?.abort();
    clearActiveRequest();

    deps.updateStore((previous) => ({
      ...previous,
      kimiChatBusy: false,
      kimiChatActiveAssistantEntryId: null,
    }));
    appendStatus("已停止生成");
  }

  async function openHistory(): Promise<void> {
    const current = deps.readStore();
    const operatorLarkId = readOperatorLarkId();
    const masterUserId = current.state.identity.masterUserId;

    if (!operatorLarkId) {
      deps.appendLog("error", "缺少 operatorLarkId，无法加载历史会话");
      return;
    }
    if (!masterUserId) {
      deps.appendLog("error", "缺少 masterUserId，无法加载历史会话");
      return;
    }

    deps.updateStore((previous) => ({
      ...previous,
      kimiChatHistoryLoading: true,
    }));

    void deps.postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "acp.history.open",
      detail: {
        activePage: current.activePage,
        transcriptLength: current.kimiChatTranscript.length,
      },
    });

    try {
      const result = await listKimiChatSessions({
        masterUserId,
        operatorLarkId,
      });
      deps.appendLog("debug", `历史会话列表返回：ok=${result.ok}, sessions count=${result.data?.sessions?.length ?? 0}`);

      if (!result.ok || !result.data) {
        deps.appendLog(
          "error",
          `历史会话加载失败: ${result.error?.errorMessage || "未知错误"}`,
        );
        return;
      }

      deps.appendLog(
        "debug",
        `历史会话列表：${result.data.sessions
          .map((session) => `${session.sessionId}(${session.title || "无标题"})`)
          .join(", ")}`,
      );

      const historyItems = await buildHistoryItems(
        operatorLarkId,
        result.data.sessions,
      );

      deps.updateStore((previous) => ({
        ...previous,
        kimiChatHistoryItems: historyItems,
        kimiChatHistoryOpen: true,
      }));
    } catch (error) {
      deps.appendLog(
        "error",
        `历史会话加载失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      deps.updateStore((previous) => ({
        ...previous,
        kimiChatHistoryLoading: false,
      }));
    }
  }

  async function loadHistorySession(sessionId: string): Promise<void> {
    const operatorLarkId = readOperatorLarkId();
    const masterUserId = deps.readStore().state.identity.masterUserId;

    if (!operatorLarkId) {
      deps.appendLog("error", "缺少 operatorLarkId，无法加载历史会话");
      return;
    }
    if (!masterUserId) {
      deps.appendLog("error", "缺少 masterUserId，无法加载历史会话");
      return;
    }

    deps.appendLog("debug", `开始加载历史会话：${sessionId}`);

    const result = await loadKimiChatSession({
      masterUserId,
      operatorLarkId,
      sessionId,
    });

    deps.appendLog("debug", `历史会话加载返回：ok=${result.ok}, events count=${result.data?.events?.length ?? 0}, 第一个事件=${result.data?.events?.[0]?.event}`);

    if (!result.ok || !result.data) {
      deps.appendLog(
        "error",
        `历史会话加载失败: ${result.error?.errorMessage || "未知错误"}`,
      );
      return;
    }

    cancelPendingRenderState();
    clearActiveRequest();

    let nextState: KimiChatRenderState = {
      sessionId: null,
      activeAssistantEntryId: null,
      transcript: [],
    };

    for (const event of result.data.events) {
      const prevState = nextState;
      nextState = applyKimiChatEvent(nextState, event);
      deps.appendLog("debug", `事件 ${event.event} 处理后 transcript 类型：${Array.isArray(nextState.transcript) ? "array" : typeof nextState.transcript}`);
      if (!Array.isArray(nextState.transcript)) {
        deps.appendLog("error", `transcript 不是数组！事件：${event.event}, 前一个状态 transcript 类型：${Array.isArray(prevState.transcript) ? "array" : typeof prevState.transcript}`);
      }
    }

    // Ensure transcript is always an array after applying events
    if (!Array.isArray(nextState.transcript)) {
      console.error("[popup:kimi-chat] transcript is not an array after applying events", {
        sessionId,
        transcriptType: typeof nextState.transcript,
        transcript: nextState.transcript,
      });
      deps.appendLog("error", `transcript 不是数组，已重置为空数组。sessionId=${sessionId}, transcriptType=${typeof nextState.transcript}`);
      nextState.transcript = [];
    }

    const hasVisibleMessages = nextState.transcript.some(
      (entry) => entry.kind === "user" || entry.kind === "assistant",
    );

    deps.appendLog("debug", `是否有可见消息：${hasVisibleMessages}, transcript 长度：${nextState.transcript.length}`);

    if (!hasVisibleMessages) {
      deps.appendLog("debug", `没有可见消息，尝试加载本地快照`);
      const snapshot = await loadKimiChatTranscriptSnapshot({
        operatorLarkId,
        sessionId,
      });

      if (snapshot?.transcript?.length && Array.isArray(snapshot.transcript)) {
        deps.appendLog("debug", `从本地快照加载了 ${snapshot.transcript.length} 条消息`);
        nextState = {
          sessionId,
          activeAssistantEntryId: null,
          transcript: snapshot.transcript,
        };
      } else {
        deps.appendLog("debug", `本地快照不可用：${JSON.stringify({ hasSnapshot: !!snapshot, transcriptLength: snapshot?.transcript?.length, isArray: Array.isArray(snapshot?.transcript) })}`);
      }
    }

    applyRenderState(nextState);
    deps.updateStore((previous) => ({
      ...previous,
      showKimiChat: true,
      activePage: "chat",
      kimiChatBusy: false,
      kimiChatDraftMessage: "",
      kimiChatHistoryOpen: false,
    }));
    deps.appendLog("debug", `历史会话 ${sessionId} 加载完成`);
  }

  async function deleteHistorySession(sessionId: string): Promise<void> {
    const operatorLarkId = readOperatorLarkId();
    const masterUserId = deps.readStore().state.identity.masterUserId;

    if (!operatorLarkId) {
      deps.appendLog("error", "缺少 operatorLarkId，无法删除历史会话");
      return;
    }
    if (!masterUserId) {
      deps.appendLog("error", "缺少 masterUserId，无法删除历史会话");
      return;
    }

    const result = await deleteKimiChatSession({
      masterUserId,
      operatorLarkId,
      sessionId,
    });

    if (!result.ok) {
      deps.appendLog(
        "error",
        `历史会话删除失败: ${result.error?.errorMessage || "未知错误"}`,
      );
      return;
    }

    await deleteKimiChatTranscriptSnapshot({
      operatorLarkId,
      sessionId,
    });

    deps.updateStore((previous) => ({
      ...previous,
      kimiChatHistoryItems: previous.kimiChatHistoryItems.filter(
        (item) => item.sessionId !== sessionId,
      ),
    }));

    if (deps.readStore().kimiChatSessionId === sessionId) {
      cancelPendingRenderState();
      clearActiveRequest();
      deps.updateStore((previous) => ({
        ...previous,
        kimiChatBusy: false,
        kimiChatSessionId: null,
        kimiChatDraftMessage: "",
        kimiChatActiveAssistantEntryId: null,
        kimiChatTranscript: [],
      }));
    }
  }

  async function renameSession(title: string): Promise<void> {
    const operatorLarkId = readOperatorLarkId();
    const masterUserId = deps.readStore().state.identity.masterUserId;
    const sessionId = deps.readStore().kimiChatSessionId;

    if (!operatorLarkId || !masterUserId || !sessionId) {
      return;
    }

    const result = await renameKimiChatSession({
      masterUserId,
      operatorLarkId,
      sessionId,
      title,
    });

    if (!result.ok) {
      deps.appendLog(
        "warn",
        `会话重命名失败: ${result.error?.errorMessage || "未知错误"}`,
      );
    }
  }

  async function sendMessage(messageText: string): Promise<void> {
    const current = deps.readStore();
    const operatorLarkId = readOperatorLarkId();
    const masterUserId = current.state.identity.masterUserId;
    const hadSessionIdBefore = Boolean(current.kimiChatSessionId);

    void deps.postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "acp.send.start",
      detail: {
        activePage: current.activePage,
        hasOperatorLarkId: Boolean(operatorLarkId),
        hasSessionId: Boolean(current.kimiChatSessionId),
        transcriptLength: current.kimiChatTranscript.length,
        messageLength: messageText.length,
      },
    });

    if (!operatorLarkId) {
      deps.appendLog("error", "缺少 operatorLarkId，无法发送 Kimi ACP 消息");
      void deps.postClientDebugLog({
        source: "popup:app",
        level: "error",
        event: "acp.send.blocked_missing_operator",
        detail: {
          activePage: current.activePage,
          stateLarkId: current.state.identity.larkId || null,
          settingsLarkUserId: current.settingsForm.larkUserId || null,
          masterUserId: current.state.identity.masterUserId || null,
        },
      });
      return;
    }
    if (!masterUserId) {
      deps.appendLog("error", "缺少 masterUserId，无法发送 Kimi ACP 消息");
      return;
    }

    deps.updateStore((previous) => ({
      ...previous,
      showKimiChat: true,
      activePage: "chat",
      kimiChatBusy: true,
    }));

    const client = createKimiChatClient({
      baseUrl: deps.readStore().settingsForm.SERVER_URL,
      masterUserId,
    });

    const userEntryId = createTranscriptEntryId("user");
    const requestId = ++nextRequestIdRef.current;
    const abortController = new AbortController();
    let receivedEvents = false;

    try {
      activeRequestIdRef.current = requestId;
      abortControllerRef.current = abortController;

      deps.updateStore((previous) => ({
        ...previous,
        kimiChatDraftMessage: "",
        kimiChatActiveAssistantEntryId: null,
        kimiChatTranscript: [
          ...previous.kimiChatTranscript,
          {
            id: userEntryId,
            kind: "user",
            text: messageText,
          },
        ],
      }));

      const currentForRequest = deps.readStore();
      const request: {
        operatorLarkId: string;
        message: string;
        sessionId?: string;
      } = {
        operatorLarkId,
        message: messageText,
      };

      if (currentForRequest.kimiChatSessionId) {
        request.sessionId = currentForRequest.kimiChatSessionId;
      }

      await client.sendMessage(request, {
        signal: abortController.signal,
        onEvent(event) {
          if (
            abortController.signal.aborted ||
            activeRequestIdRef.current !== requestId
          ) {
            return;
          }

          receivedEvents = true;
          appendEvent(event);
        },
      });

      void deps.postClientDebugLog({
        source: "popup:app",
        level: "info",
        event: "acp.send.completed",
        detail: {
          activePage: deps.readStore().activePage,
          sessionId: deps.readStore().kimiChatSessionId,
          transcriptLength: deps.readStore().kimiChatTranscript.length,
        },
      });

      if (activeRequestIdRef.current === requestId) {
        flushPendingRenderState();

        // Auto-rename new session from first message (first 10 chars)
        if (!hadSessionIdBefore) {
          const currentSessionId = deps.readStore().kimiChatSessionId;
          if (currentSessionId && messageText) {
            const title = messageText.replace(/\s+/g, " ").trim().slice(0, 10);
            if (title) {
              void renameKimiChatSession({
                masterUserId,
                operatorLarkId,
                sessionId: currentSessionId,
                title,
              });
            }
          }
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      flushPendingRenderState();

      const errorCode =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined;

      deps.updateStore((previous) => ({
        ...previous,
        kimiChatSessionId:
          errorCode === "SESSION_FORBIDDEN" || errorCode === "SESSION_NOT_FOUND"
            ? null
            : previous.kimiChatSessionId,
        kimiChatActiveAssistantEntryId: null,
        kimiChatDraftMessage: messageText,
        kimiChatTranscript: receivedEvents
          ? previous.kimiChatTranscript
          : previous.kimiChatTranscript.filter((entry) => entry.id !== userEntryId),
      }));

      deps.appendLog(
        "error",
        `Kimi ACP 请求失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      void deps.postClientDebugLog({
        source: "popup:app",
        level: "error",
        event: "acp.send.failed",
        detail: {
          activePage: deps.readStore().activePage,
          errorCode: errorCode ?? null,
          errorMessage: error instanceof Error ? error.message : String(error),
          receivedEvents,
        },
      });
    } finally {
      if (activeRequestIdRef.current === requestId) {
        clearActiveRequest();
        deps.updateStore((previous) => ({
          ...previous,
          kimiChatBusy: false,
        }));
      }
    }
  }

  function dispose(): void {
    cancelPendingRenderState();
    abortControllerRef.current?.abort();
    clearActiveRequest();
  }

  return {
    resetSession,
    openHistory,
    loadHistorySession,
    deleteHistorySession,
    renameSession,
    sendMessage,
    stopGeneration,
    dispose,
  };
}

function createTranscriptEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function shouldUseFallbackSessionTitle(title?: string | null): boolean {
  const normalized = title?.trim();
  return !normalized || /^untitled\b/i.test(normalized);
}

function deriveKimiChatSessionTitle(
  transcript: KimiChatTranscriptEntry[],
): string | null {
  if (!Array.isArray(transcript)) {
    return null;
  }

  const source = transcript.find(
    (entry) =>
      (entry.kind === "user" || entry.kind === "assistant") &&
      typeof entry.text === "string" &&
      entry.text.trim().length > 0,
  );

  if (!source?.text) {
    return null;
  }

  const normalized = source.text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 24) {
    return normalized;
  }

  return `${normalized.slice(0, 24)}...`;
}

function scheduleAnimationFrame(callback: FrameRequestCallback): ScheduledFrameHandle {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(() => {
    callback(Date.now());
  }, 16);
}

function cancelScheduledAnimationFrame(handle: ScheduledFrameHandle): void {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle as number);
    return;
  }

  globalThis.clearTimeout(handle);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
