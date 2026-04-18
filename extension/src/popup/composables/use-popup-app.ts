import { computed, reactive, ref, watch } from "vue";
import type { LarkAuthEnsureResponse } from "../../types/lark.js";
import type { MeegleAuthEnsureResponse } from "../../types/meegle.js";
import {
  createMeegleAuthController,
  resolveMeegleStatusDisplay,
  type PopupMeegleAuthLog,
} from "../meegle-auth.js";
import {
  clearResolvedIdentity,
  clearResolvedIdentityForTab,
  deleteKimiChatSession,
  deleteKimiChatTranscriptSnapshot,
  fetchLarkUserInfo,
  getConfig,
  getLarkAuthStatus,
  listKimiChatSessions,
  loadKimiChatTranscriptSnapshot,
  loadPopupSettings,
  loadKimiChatSession,
  loadResolvedIdentity,
  postClientDebugLog,
  queryActiveTabContext,
  requestLarkUserId,
  requestMeegleUserIdentity,
  resolveIdentityRequest,
  runLarkAuthRequest,
  runMeegleAuthRequest,
  runMeegleLarkPushRequest,
  saveKimiChatTranscriptSnapshot,
  saveResolvedIdentity,
  saveResolvedIdentityForTab,
  savePopupSettings,
  watchLarkAuthCallbackResult,
} from "../runtime.js";
import type {
  PopupFeatureAction,
  PopupLogEntry,
  PopupLogLevel,
  PopupNotebookPage,
  PopupSettingsForm,
  PopupStatusChip,
} from "../types.js";
import {
  buildPopupHeaderContext,
  createPopupViewModel,
  type PopupPageType,
} from "../view-model.js";
import {
  applyKimiChatEvent,
  createKimiChatClient,
} from "../kimi-chat.js";
import {
  normalizeLarkAuthBaseUrl,
  normalizeMeegleAuthBaseUrl,
} from "../../platform-url.js";
import { createExtensionLogger, exportLogsAsBlob } from "../../logger.js";
import { message } from "ant-design-vue";
import type {
  KimiChatEvent,
  KimiChatRenderState,
  KimiChatSessionSummary,
  KimiChatTranscriptEntry,
} from "../../types/acp-kimi.js";

const popupLogger = createExtensionLogger("popup:app");

interface PopupIdentityState {
  masterUserId: string | null;
  larkId: string | null;
  larkEmail: string | null;
  larkName: string | null;
  larkAvatar: string | null;
  meegleUserKey: string | null;
}

interface PopupAuthFlags {
  lark: boolean;
  meegle: boolean;
}

type ScheduledFrameHandle = number | ReturnType<typeof globalThis.setTimeout>;

function createDefaultSettingsForm(): PopupSettingsForm {
  return {
    SERVER_URL: "https://octo.odoo.tenways.it:18443",
    MEEGLE_PLUGIN_ID: "",
    LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    meegleUserKey: "",
    larkUserId: "",
  };
}

export function usePopupApp() {
  const logs = ref<PopupLogEntry[]>([]);
  const isLoading = ref(true);
  const hasResolvedPageContext = ref(false);
  const activePage = ref<PopupNotebookPage>("automation");
  const showKimiChat = ref(false);
  const kimiChatBusy = ref(false);
  const kimiChatSessionId = ref<string | null>(null);
  const kimiChatDraftMessage = ref("");
  const kimiChatActiveAssistantEntryId = ref<string | null>(null);
  const kimiChatTranscript = ref<KimiChatTranscriptEntry[]>([]);
  const kimiChatHistoryOpen = ref(false);
  const kimiChatHistoryLoading = ref(false);
  const kimiChatHistoryItems = ref<KimiChatSessionSummary[]>([]);
  let pendingKimiChatState: KimiChatRenderState | null = null;
  let pendingKimiChatFlushHandle: ScheduledFrameHandle | null = null;
  let activeKimiChatRequestId = 0;
  let nextKimiChatRequestId = 0;
  let kimiChatAbortController: AbortController | null = null;
  const state = reactive({
    pageType: "unsupported" as PopupPageType,
    currentTabId: null as number | null,
    currentTabOrigin: null as string | null,
    currentUrl: null as string | null,
    identity: {
      larkId: null,
      larkEmail: null,
      larkName: null,
      larkAvatar: null,
      masterUserId: null,
      meegleUserKey: null,
    } as PopupIdentityState,
    isAuthed: {
      lark: false,
      meegle: false,
    } as PopupAuthFlags,
    meegleAuth: undefined as MeegleAuthEnsureResponse | undefined,
    larkAuth: undefined as LarkAuthEnsureResponse | undefined,
  });
  const settingsForm = reactive(createDefaultSettingsForm());
  let settingsSnapshot = createDefaultSettingsForm();

  const logAdapter: PopupMeegleAuthLog = {
    add(message) {
      appendLog("info", message);
    },
    success(message) {
      appendLog("success", message);
    },
    warn(message) {
      appendLog("warn", message);
    },
    error(message) {
      appendLog("error", message);
    },
  };

  const meegleAuthController = createMeegleAuthController({
    sendMessage: runMeegleAuthRequest,
    setStatus: () => {
      // Vue derives display state from reactive auth flags and identity.
    },
    log: logAdapter,
  });

  void watch(activePage, (nextPage, previousPage) => {
    popupLogger.info("activePage.changed", {
      previousPage,
      nextPage,
    });
    void postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "activePage.changed",
      detail: {
        previousPage,
        nextPage,
      },
    });
  });

  function getKimiChatRenderState(): KimiChatRenderState {
    return (
      pendingKimiChatState ?? {
        sessionId: kimiChatSessionId.value,
        activeAssistantEntryId: kimiChatActiveAssistantEntryId.value,
        transcript: kimiChatTranscript.value,
      }
    );
  }

  function applyKimiChatRenderState(nextState: KimiChatRenderState): void {
    kimiChatSessionId.value = nextState.sessionId;
    kimiChatActiveAssistantEntryId.value = nextState.activeAssistantEntryId;
    kimiChatTranscript.value = nextState.transcript;
    void persistCurrentKimiChatSnapshot();
  }

  function flushPendingKimiChatState(): void {
    pendingKimiChatFlushHandle = null;
    if (!pendingKimiChatState) {
      return;
    }

    const nextState = pendingKimiChatState;
    pendingKimiChatState = null;
    applyKimiChatRenderState(nextState);
  }

  function schedulePendingKimiChatState(nextState: KimiChatRenderState): void {
    pendingKimiChatState = nextState;
    if (pendingKimiChatFlushHandle != null) {
      return;
    }

    pendingKimiChatFlushHandle = scheduleAnimationFrame(() => {
      flushPendingKimiChatState();
    });
  }

  function cancelPendingKimiChatState(): void {
    if (pendingKimiChatState?.sessionId) {
      kimiChatSessionId.value = pendingKimiChatState.sessionId;
    }

    pendingKimiChatState = null;

    if (pendingKimiChatFlushHandle != null) {
      cancelScheduledAnimationFrame(pendingKimiChatFlushHandle);
      pendingKimiChatFlushHandle = null;
    }
  }

  function appendKimiChatEvent(event: KimiChatEvent): void {
    schedulePendingKimiChatState(
      applyKimiChatEvent(getKimiChatRenderState(), event),
    );
  }

  function appendKimiChatStatus(text: string): void {
    flushPendingKimiChatState();
    kimiChatTranscript.value = [
      ...kimiChatTranscript.value,
      {
        id: createTranscriptEntryId("status"),
        kind: "status",
        text,
      },
    ];
    void persistCurrentKimiChatSnapshot();
  }

  function clearActiveKimiChatRequest(): void {
    activeKimiChatRequestId = 0;
    kimiChatAbortController = null;
  }

  async function persistCurrentKimiChatSnapshot(): Promise<void> {
    const operatorLarkId = state.identity.larkId || settingsForm.larkUserId;
    const sessionId = kimiChatSessionId.value;
    if (!operatorLarkId || !sessionId || kimiChatTranscript.value.length === 0) {
      return;
    }

    await saveKimiChatTranscriptSnapshot({
      operatorLarkId,
      sessionId,
      transcript: kimiChatTranscript.value,
      updatedAt: new Date().toISOString(),
    });
  }

  async function buildKimiChatHistoryItems(
    operatorLarkId: string,
    sessions: KimiChatSessionSummary[],
  ): Promise<KimiChatSessionSummary[]> {
    return await Promise.all(
      sessions.map(async (session) => {
        const snapshot = await loadKimiChatTranscriptSnapshot({
          operatorLarkId,
          sessionId: session.sessionId,
        });
        const fallbackTitle = deriveKimiChatSessionTitle(snapshot?.transcript ?? []);

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

  const viewModel = computed(() =>
    createPopupViewModel({
      pageType: state.pageType,
      identity: state.identity,
      isAuthed: state.isAuthed,
    }),
  );
  const headerSubtitle = computed(() => {
    if (activePage.value === "settings") {
      return "设置";
    }

    if (activePage.value === "profile") {
      return "个人";
    }

    if (!hasResolvedPageContext.value) {
      return isLoading.value ? "Scanning" : null;
    }

    if (state.pageType === "unsupported") {
      return "Unsupported";
    }

    return buildPopupHeaderContext({
      platform: state.pageType === "lark" ? "Lark" : "Meegle",
    });
  });
  const settingsOpen = computed(() => activePage.value === "settings");
  const meegleStatus = computed(() =>
    resolveMeegleStatusChip(state.meegleAuth, state.identity.meegleUserKey),
  );
  const larkStatus = computed(() =>
    resolveLarkStatusChip(state.larkAuth, state.identity.larkId),
  );
  const topMeegleButtonText = computed(() =>
    state.isAuthed.meegle ? "已授权" : "授权",
  );
  const topLarkButtonText = computed(() =>
    state.isAuthed.lark ? "重新授权" : "授权",
  );
  const topMeegleButtonDisabled = computed(() => state.isAuthed.meegle);
  const topLarkButtonDisabled = computed(() => false);
  const larkActions = computed<PopupFeatureAction[]>(() => [
    {
      key: "analyze",
      label: "分析当前页面",
      type: "primary",
      disabled: !viewModel.value.canAnalyze,
    },
  ]);
  const meegleActions = computed<PopupFeatureAction[]>(() => [
    {
      key: "update-lark-and-push",
      label: "更新Lark及推送",
      type: "primary",
      disabled: false,
    },
  ]);
  void watchLarkAuthCallbackResult(async (result) => {
    if (result.masterUserId && result.masterUserId !== state.identity.masterUserId) {
      state.identity.masterUserId = result.masterUserId;
      await saveResolvedIdentity(result.masterUserId);
      if (state.currentTabId != null) {
        await saveResolvedIdentityForTab(state.currentTabId, result.masterUserId);
      }
    }

    if (result.status === "ready") {
      appendLog("success", "Lark 授权完成");
      const auth = await checkLarkAuth();
      state.larkAuth = auth;
      state.isAuthed.lark = auth.status === "ready";

      if (auth.status === "ready" && auth.masterUserId && auth.baseUrl) {
        await hydrateLarkIdentityFromServer(auth.masterUserId, auth.baseUrl);
      }

      return;
    }

    appendLog("error", `Lark 授权失败: ${result.reason || "Unknown error"}`);
  });

  async function initialize() {
    appendLog("info", "初始化...");
    try {
      const settings = await loadPopupSettings();
      syncSettingsForm(settings);
      settingsSnapshot = { ...settings };
      hydrateIdentityFromSettings(settings);
      state.identity.masterUserId = await loadResolvedIdentity() ?? null;

      const tabContext = await queryActiveTabContext();
      state.currentTabId = tabContext.id;
      state.currentUrl = tabContext.url;
      state.currentTabOrigin = tabContext.origin;
      state.pageType = tabContext.pageType;
      hasResolvedPageContext.value = true;

      appendLog("info", `检测到页面: ${tabContext.url || "(空)"} · 类型: ${tabContext.pageType}`);

      if (tabContext.pageType === "unsupported") {
        appendLog("warn", "当前页面不支持");
        return;
      }

      if (tabContext.pageType === "lark" && tabContext.id != null) {
        const larkId = await requestLarkUserId(tabContext.id);
        if (larkId) {
          state.identity.larkId = larkId;
        }
      }

      if (tabContext.pageType === "meegle" && tabContext.id != null) {
        const identity = await requestMeegleUserIdentity(
          tabContext.id,
          tabContext.url ?? undefined,
        );
        if (identity?.userKey) {
          state.identity.meegleUserKey = identity.userKey;
        }
      }

      await ensureResolvedIdentity();

      await refreshAuthStates();
      await hydrateLarkIdentityIfReady();

      if (!state.isAuthed.lark || !state.isAuthed.meegle) {
        activePage.value = "profile";
        appendLog("warn", "Lark 或 Meegle 未授权，已切换到个人页面");
      }

      appendLog("success", "初始化完成");
    } catch (error) {
      appendLog(
        "error",
        `初始化失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      isLoading.value = false;
    }
  }

  async function refreshAuthStates() {
    await Promise.allSettled([
      (async () => {
        try {
          const meegleAuth = await checkMeegleAuth();
          state.meegleAuth = meegleAuth;
          state.isAuthed.meegle = meegleAuth.status === "ready";
        } catch (error) {
          state.meegleAuth = {
            status: "failed",
            baseUrl: state.currentTabOrigin || "https://project.larksuite.com",
            reason: "STATUS_REQUEST_FAILED",
            errorMessage:
              error instanceof Error ? error.message : String(error),
          };
          state.isAuthed.meegle = false;
          appendLog(
            "warn",
            `查询服务器授权状态失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      })(),
      (async () => {
        try {
          const larkAuth = await checkLarkAuth();
          state.larkAuth = larkAuth;
          state.isAuthed.lark = larkAuth.status === "ready";
        } catch (error) {
          state.larkAuth = {
            status: "failed",
            baseUrl: state.currentTabOrigin || "https://open.larksuite.com",
            reason: "BACKGROUND_ERROR",
          };
          state.isAuthed.lark = false;
          appendLog(
            "warn",
            `查询 Lark 授权状态失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      })(),
    ]);
  }

  async function checkMeegleAuth(): Promise<MeegleAuthEnsureResponse> {
    const config = await getConfig();
    const settings = await loadPopupSettings();
    const authBaseUrl = normalizeMeegleAuthBaseUrl(
      state.currentTabOrigin,
      config.MEEGLE_BASE_URL,
    );
    const meegleUserKey =
      settings.meegleUserKey || state.identity.meegleUserKey || undefined;
    const masterUserId = await ensureResolvedIdentity();

    if (!masterUserId) {
      return {
        status: "failed",
        baseUrl: authBaseUrl,
        reason: "IDENTITY_RESOLUTION_FAILED",
        errorMessage: "Unable to resolve master user identity for Meegle auth.",
      };
    }

    try {
      const response = await fetch(`${config.SERVER_URL}/api/meegle/auth/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          masterUserId,
          meegleUserKey,
          baseUrl: authBaseUrl,
        }),
      });

      if (!response.ok) {
        return {
          status: "failed",
          baseUrl: authBaseUrl,
          reason: "STATUS_REQUEST_FAILED",
          errorMessage: `Auth status request failed with ${response.status}.`,
        };
      }

      const result = (await response.json()) as {
        data?: MeegleAuthEnsureResponse;
      };

      return (
        result.data || {
          status: "failed",
          baseUrl: authBaseUrl,
          reason: "STATUS_REQUEST_FAILED",
          errorMessage: "Meegle auth status response payload is missing.",
        }
      );
    } catch (error) {
      appendLog(
        "warn",
        `查询服务器授权状态失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        status: "failed",
        baseUrl: authBaseUrl,
        reason: "STATUS_REQUEST_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Meegle auth error.",
      };
    }
  }

  async function checkLarkAuth(): Promise<LarkAuthEnsureResponse> {
    return getLarkAuthStatus({
      masterUserId: state.identity.masterUserId || undefined,
      baseUrl: normalizeLarkAuthBaseUrl(state.currentTabOrigin),
    });
  }

  async function authorizeMeegle() {
    const config = await getConfig();
    if (state.pageType === "meegle" && state.currentTabId != null) {
      const identity = await requestMeegleUserIdentity(
        state.currentTabId,
        state.currentUrl ?? undefined,
      );
      if (identity?.userKey) {
        state.identity.meegleUserKey = identity.userKey;
      }
    }

    const masterUserId = await ensureResolvedIdentity();

    if (!masterUserId) {
      appendLog("error", "无法解析主身份，暂时不能发起 Meegle 授权");
      state.isAuthed.meegle = false;
      return;
    }

    const success = await meegleAuthController.run({
      currentTabId: state.currentTabId ?? undefined,
      currentTabOrigin: state.currentTabOrigin || undefined,
      authBaseUrl: normalizeMeegleAuthBaseUrl(
        state.currentTabOrigin,
        config.MEEGLE_BASE_URL,
      ),
      currentPageType: state.pageType,
      masterUserId,
      meegleUserKey: state.identity.meegleUserKey || undefined,
    });

    state.meegleAuth =
      meegleAuthController.getLastAuth() || state.meegleAuth;
    state.isAuthed.meegle = success;
  }

  async function authorizeLark() {
    appendLog("info", "检查 Lark 授权...");
    const masterUserId = await ensureResolvedIdentity();

    if (!masterUserId) {
      appendLog("error", "无法解析主身份，暂时不能发起 Lark 授权");
      state.isAuthed.lark = false;
      return;
    }

    const auth = await checkLarkAuth();
    state.larkAuth = auth;
    state.isAuthed.lark = auth.status === "ready";

    const force = auth.status === "ready";
    if (force) {
      appendLog("info", "重新发起 Lark 授权...");
    }

    const started = await runLarkAuthRequest({
      masterUserId,
      baseUrl: normalizeLarkAuthBaseUrl(state.currentTabOrigin),
      force,
    });
    state.larkAuth = started;
    state.isAuthed.lark = started.status === "ready";

    if (started.status === "ready") {
      appendLog("success", "Lark 已授权");
      return;
    }

    if (started.status === "in_progress") {
      appendLog("info", "已打开 Lark 授权页，等待完成授权");
      return;
    }

    appendLog("warn", started.errorMessage || started.reason || "需要登录 Lark");
  }

  function openSettings() {
    activePage.value = "settings";
  }

  function closeSettings() {
    syncSettingsForm(settingsSnapshot);
    activePage.value = "chat";
  }

  async function fetchMeegleUserKey() {
    if (state.pageType !== "meegle" || state.currentTabId == null) {
      appendLog("warn", "当前标签页不是 Meegle 页面，无法自动获取 User Key");
      return;
    }

    const identity = await requestMeegleUserIdentity(
      state.currentTabId,
      state.currentUrl ?? undefined,
    );

    if (!identity?.userKey) {
      appendLog("warn", "未能从当前页面获取 Meegle User Key");
      return;
    }

    state.identity.meegleUserKey = identity.userKey;
    settingsForm.meegleUserKey = identity.userKey;
    appendLog("success", `已获取 Meegle User Key: ${identity.userKey}`);
  }

  async function saveSettingsForm() {
    await savePopupSettings({ ...settingsForm });
    const refreshedSettings = await loadPopupSettings();
    syncSettingsForm(refreshedSettings);
    settingsSnapshot = { ...refreshedSettings };
    hydrateIdentityFromSettings(refreshedSettings);
    appendLog("success", "设置已保存");
    activePage.value = "chat";
    await refreshAuthStates();
  }

  async function refreshServerConfig() {
    const refreshedSettings = await loadPopupSettings();
    syncSettingsForm(refreshedSettings);
    settingsSnapshot = { ...refreshedSettings };
    appendLog(
      "success",
      `已刷新服务端配置: ${refreshedSettings.LARK_OAUTH_CALLBACK_URL}`,
    );
  }

  function clearLogs() {
    logs.value = [];
  }

  async function runFeatureAction(actionKey: string) {
    if (actionKey === "analyze") {
      if (showKimiChat.value) {
        resetKimiChatSession();
        appendLog("info", "已重置 Kimi ACP 会话");
        return;
      }

      openKimiChat();
      appendLog("info", "已打开 Kimi ACP 聊天面板");
      return;
    }

    const labels: Record<string, string> = {
      analyze: "分析中...",
      draft: "生成草稿...",
      apply: "确认创建...",
      "update-lark-and-push": "更新 Lark 及推送中...",
    };

    appendLog("info", labels[actionKey] || "执行操作中...");

    if (actionKey === "update-lark-and-push") {
      appendLog("info", "[更新Lark及推送] 开始执行");
      const currentUrl = state.currentUrl;
      if (!currentUrl) {
        appendLog("error", "当前页面 URL 为空，无法执行推送");
        return;
      }

      let pathname: string;
      try {
        pathname = new URL(currentUrl).pathname;
        appendLog("info", `[更新Lark及推送] 解析 URL pathname: ${pathname}`);
      } catch {
        appendLog("error", "当前页面 URL 解析失败");
        return;
      }

      const pathParts = pathname.split("/").filter(Boolean);
      appendLog("info", `[更新Lark及推送] 路径片段: ${pathParts.join(", ")}`);
      if (pathParts.length < 4 || pathParts[2] !== "detail") {
        appendLog("error", `无法从 URL 解析工作项信息: ${pathname}`);
        return;
      }

      const [projectKey, workItemTypeKey, , workItemId] = pathParts;
      const masterUserId = state.identity.masterUserId;
      if (!masterUserId) {
        appendLog("error", "未解析到主身份，无法执行推送");
        return;
      }

      const baseUrl = state.currentTabOrigin || "https://project.larksuite.com";
      appendLog("info", `[更新Lark及推送] 准备调用服务端 API: project=${projectKey}, type=${workItemTypeKey}, id=${workItemId}, masterUserId=${masterUserId}`);

      const result = await runMeegleLarkPushRequest({
        projectKey,
        workItemTypeKey,
        workItemId,
        masterUserId,
        baseUrl,
      });

      appendLog("info", `[更新Lark及推送] 服务端响应: ok=${result.ok}, alreadyUpdated=${result.alreadyUpdated}, larkBaseUpdated=${result.larkBaseUpdated}, messageSent=${result.messageSent}, reactionAdded=${result.reactionAdded}, meegleStatusUpdated=${result.meegleStatusUpdated}`);

      if (!result.ok) {
        const errorMsg = `推送失败: ${result.error || "未知错误"}`;
        showToast(errorMsg, "error");
        appendLog("warn", errorMsg);
        return;
      }

      if (result.alreadyUpdated) {
        const alreadyMsg = "该工作项已经更新过，无需重复推送";
        showToast(alreadyMsg, "warn");
        appendLog("warn", alreadyMsg);
        return;
      }

      const parts: string[] = [];
      if (result.larkBaseUpdated) parts.push("Lark Base 状态已更新");
      if (result.messageSent) parts.push("Lark 消息已发送");
      if (result.reactionAdded) parts.push("Lark 消息 reaction 已添加");
      if (result.meegleStatusUpdated) parts.push("Meegle 状态已更新");

      const successMsg = `推送完成${parts.length ? ": " + parts.join("、") : ""}`;
      showToast(successMsg, "success");
      appendLog("success", successMsg);

      activePage.value = "chat";
      if (state.currentTabId != null && currentUrl) {
        try {
          const url = new URL(currentUrl);
          url.searchParams.set("tabKey", "txHFa5L16");
          url.hash = "txHFa5L16";
          chrome.tabs.update(state.currentTabId, { url: url.toString() });
          appendLog("info", `[更新Lark及推送] 已跳转页面: ${url.toString()}`);
        } catch {
          appendLog("warn", "[更新Lark及推送] 页面跳转失败");
        }
      }
      return;
    }

    appendLog("warn", "功能开发中，请稍后");
  }

  function openKimiChat() {
    activePage.value = "chat";
    if (showKimiChat.value) {
      return;
    }

    showKimiChat.value = true;
    resetKimiChatSession();
  }

  function resetKimiChatSession() {
    void postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "acp.session.reset",
      detail: {
        activePage: activePage.value,
        hadSessionId: Boolean(kimiChatSessionId.value),
        transcriptLength: kimiChatTranscript.value.length,
      },
    });
    cancelPendingKimiChatState();
    if (kimiChatAbortController) {
      kimiChatAbortController.abort();
    }
    clearActiveKimiChatRequest();
    kimiChatBusy.value = false;
    kimiChatSessionId.value = null;
    kimiChatDraftMessage.value = "";
    kimiChatActiveAssistantEntryId.value = null;
    kimiChatTranscript.value = [];
  }

  function updateKimiChatDraftMessage(message: string) {
    kimiChatDraftMessage.value = message;
  }

  function stopKimiChatGeneration() {
    if (!kimiChatBusy.value) {
      return;
    }

    flushPendingKimiChatState();
    kimiChatAbortController?.abort();
    clearActiveKimiChatRequest();
    kimiChatBusy.value = false;
    kimiChatActiveAssistantEntryId.value = null;
    appendKimiChatStatus("已停止生成");
  }

  async function openKimiChatHistory() {
    const operatorLarkId = state.identity.larkId || settingsForm.larkUserId;
    if (!operatorLarkId) {
      appendLog("error", "缺少 operatorLarkId，无法加载历史会话");
      return;
    }

    kimiChatHistoryLoading.value = true;
    void postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "acp.history.open",
      detail: {
        activePage: activePage.value,
        transcriptLength: kimiChatTranscript.value.length,
      },
    });
    try {
      const result = await listKimiChatSessions({
        operatorLarkId,
      });
      if (!result.ok || !result.data) {
        appendLog(
          "error",
          `历史会话加载失败: ${result.error?.errorMessage || "未知错误"}`,
        );
        return;
      }

      kimiChatHistoryItems.value = await buildKimiChatHistoryItems(
        operatorLarkId,
        result.data.sessions,
      );
      kimiChatHistoryOpen.value = true;
    } catch (error) {
      appendLog(
        "error",
        `历史会话加载失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      kimiChatHistoryLoading.value = false;
    }
  }

  function closeKimiChatHistory() {
    kimiChatHistoryOpen.value = false;
  }

  async function loadKimiChatHistorySession(sessionId: string) {
    const operatorLarkId = state.identity.larkId || settingsForm.larkUserId;
    if (!operatorLarkId) {
      appendLog("error", "缺少 operatorLarkId，无法加载历史会话");
      return;
    }

    const result = await loadKimiChatSession({
      operatorLarkId,
      sessionId,
    });

    if (!result.ok || !result.data) {
      appendLog(
        "error",
        `历史会话加载失败: ${result.error?.errorMessage || "未知错误"}`,
      );
      return;
    }

    cancelPendingKimiChatState();
    clearActiveKimiChatRequest();
    kimiChatBusy.value = false;
    kimiChatSessionId.value = null;
    kimiChatDraftMessage.value = "";
    kimiChatActiveAssistantEntryId.value = null;

    let nextState: KimiChatRenderState = {
      sessionId: null,
      activeAssistantEntryId: null,
      transcript: [],
    };
    for (const event of result.data.events) {
      nextState = applyKimiChatEvent(nextState, event);
    }

    const hasVisibleMessages = nextState.transcript.some(
      (entry) => entry.kind === "user" || entry.kind === "assistant",
    );
    if (!hasVisibleMessages) {
      const snapshot = await loadKimiChatTranscriptSnapshot({
        operatorLarkId,
        sessionId,
      });

      if (snapshot?.transcript?.length) {
        nextState = {
          sessionId,
          activeAssistantEntryId: null,
          transcript: snapshot.transcript,
        };
      }
    }

    applyKimiChatRenderState(nextState);
    showKimiChat.value = true;
    activePage.value = "chat";
    kimiChatHistoryOpen.value = false;
  }

  async function deleteKimiChatHistorySession(sessionId: string) {
    const operatorLarkId = state.identity.larkId || settingsForm.larkUserId;
    if (!operatorLarkId) {
      appendLog("error", "缺少 operatorLarkId，无法删除历史会话");
      return;
    }

    const result = await deleteKimiChatSession({
      operatorLarkId,
      sessionId,
    });

    if (!result.ok) {
      appendLog(
        "error",
        `历史会话删除失败: ${result.error?.errorMessage || "未知错误"}`,
      );
      return;
    }

    await deleteKimiChatTranscriptSnapshot({
      operatorLarkId,
      sessionId,
    });

    kimiChatHistoryItems.value = kimiChatHistoryItems.value.filter(
      (item) => item.sessionId !== sessionId,
    );

    if (kimiChatSessionId.value === sessionId) {
      cancelPendingKimiChatState();
      clearActiveKimiChatRequest();
      kimiChatBusy.value = false;
      kimiChatSessionId.value = null;
      kimiChatDraftMessage.value = "";
      kimiChatActiveAssistantEntryId.value = null;
      kimiChatTranscript.value = [];
    }
  }

  async function sendKimiChatMessage(messageText: string) {
    const operatorLarkId = state.identity.larkId || settingsForm.larkUserId;
    void postClientDebugLog({
      source: "popup:app",
      level: "info",
      event: "acp.send.start",
      detail: {
        activePage: activePage.value,
        hasOperatorLarkId: Boolean(operatorLarkId),
        hasSessionId: Boolean(kimiChatSessionId.value),
        transcriptLength: kimiChatTranscript.value.length,
        messageLength: messageText.length,
      },
    });

    if (!operatorLarkId) {
      appendLog("error", "缺少 operatorLarkId，无法发送 Kimi ACP 消息");
      void postClientDebugLog({
        source: "popup:app",
        level: "error",
        event: "acp.send.blocked_missing_operator",
        detail: {
          activePage: activePage.value,
          stateLarkId: state.identity.larkId || null,
          settingsLarkUserId: settingsForm.larkUserId || null,
          masterUserId: state.identity.masterUserId || null,
        },
      });
      return;
    }

    showKimiChat.value = true;
    activePage.value = "chat";
    kimiChatBusy.value = true;

    const client = createKimiChatClient({
      baseUrl: settingsForm.SERVER_URL,
    });

    const userEntryId = createTranscriptEntryId("user");
    const requestId = ++nextKimiChatRequestId;
    const abortController = new AbortController();
    let receivedEvents = false;

    try {
      activeKimiChatRequestId = requestId;
      kimiChatAbortController = abortController;
      kimiChatDraftMessage.value = "";
      kimiChatActiveAssistantEntryId.value = null;
      kimiChatTranscript.value = [
        ...kimiChatTranscript.value,
        {
          id: userEntryId,
          kind: "user",
          text: messageText,
        },
      ];

      const request = {
        operatorLarkId,
        message: messageText,
      } as {
        operatorLarkId: string;
        message: string;
        sessionId?: string;
      };

      if (kimiChatSessionId.value) {
        request.sessionId = kimiChatSessionId.value;
      }

      await client.sendMessage(request, {
        signal: abortController.signal,
        onEvent(event) {
          if (
            abortController.signal.aborted ||
            activeKimiChatRequestId !== requestId
          ) {
            return;
          }

          receivedEvents = true;
          appendKimiChatEvent(event);
        },
      });

      void postClientDebugLog({
        source: "popup:app",
        level: "info",
        event: "acp.send.completed",
        detail: {
          activePage: activePage.value,
          sessionId: kimiChatSessionId.value,
          transcriptLength: kimiChatTranscript.value.length,
        },
      });

      if (activeKimiChatRequestId === requestId) {
        flushPendingKimiChatState();
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      flushPendingKimiChatState();
      kimiChatSessionId.value = null;
      kimiChatActiveAssistantEntryId.value = null;
      if (!receivedEvents) {
        kimiChatTranscript.value = kimiChatTranscript.value.filter(
          (entry) => entry.id !== userEntryId,
        );
      }
      const errorCode =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined;

      if (
        errorCode === "SESSION_FORBIDDEN" ||
        errorCode === "SESSION_NOT_FOUND"
      ) {
        kimiChatSessionId.value = null;
      }

      kimiChatDraftMessage.value = messageText;
      appendLog(
        "error",
        `Kimi ACP 请求失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      void postClientDebugLog({
        source: "popup:app",
        level: "error",
        event: "acp.send.failed",
        detail: {
          activePage: activePage.value,
          errorCode: errorCode ?? null,
          errorMessage: error instanceof Error ? error.message : String(error),
          receivedEvents,
        },
      });
    } finally {
      if (activeKimiChatRequestId === requestId) {
        clearActiveKimiChatRequest();
        kimiChatBusy.value = false;
      }
    }
  }

  function showToast(text: string, type: PopupLogLevel = "info") {
    if (type === "success") {
      message.success(text, 2);
    } else if (type === "error") {
      message.error(text, 2);
    } else if (type === "warn") {
      message.warning(text, 2);
    } else {
      message.info(text, 2);
    }
  }

  function appendLog(level: PopupLogLevel, message: string) {
    logs.value = [
      ...logs.value,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        level,
        message,
        timestamp: new Date().toLocaleTimeString(),
      },
    ];
    const detail: Record<string, unknown> | undefined =
      level === "error" || level === "warn" ? { popupLogLevel: level } : undefined;
    switch (level) {
      case "debug":
        popupLogger.debug(message, detail);
        break;
      case "success":
      case "info":
        popupLogger.info(message, detail);
        break;
      case "warn":
        popupLogger.warn(message, detail);
        break;
      case "error":
        popupLogger.error(message, detail);
        break;
    }
  }

  function exportLogs() {
    const blob = exportLogsAsBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenways-octo-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog("info", "日志已导出");
  }

  function syncSettingsForm(settings: PopupSettingsForm) {
    settingsForm.SERVER_URL = settings.SERVER_URL;
    settingsForm.MEEGLE_PLUGIN_ID = settings.MEEGLE_PLUGIN_ID;
    settingsForm.LARK_OAUTH_CALLBACK_URL = settings.LARK_OAUTH_CALLBACK_URL;
    settingsForm.meegleUserKey = settings.meegleUserKey;
    settingsForm.larkUserId = settings.larkUserId;
  }

  function hydrateIdentityFromSettings(settings: PopupSettingsForm) {
    if (settings.meegleUserKey) {
      state.identity.meegleUserKey = settings.meegleUserKey;
    }

    if (settings.larkUserId) {
      state.identity.larkId = settings.larkUserId;
    }
  }

  async function ensureResolvedIdentity(): Promise<string | undefined> {
    if (!state.currentTabOrigin) {
      return state.identity.masterUserId || undefined;
    }

    const pathname = state.currentUrl
      ? new URL(state.currentUrl).pathname
      : "/";

    const resolved = await resolveIdentityRequest({
      masterUserId: state.identity.masterUserId || undefined,
      operatorLarkId: state.identity.larkId || undefined,
      meegleUserKey: state.identity.meegleUserKey || undefined,
      pageContext: {
        platform:
          state.pageType === "lark" || state.pageType === "meegle"
            ? state.pageType
            : "unknown",
        baseUrl: state.currentTabOrigin,
        pathname,
      },
    });

    if (resolved.ok && resolved.data?.masterUserId) {
      if (resolved.data.identityStatus === "conflict") {
        state.identity.masterUserId = null;
        await clearResolvedIdentity();
        if (state.currentTabId != null) {
          await clearResolvedIdentityForTab(state.currentTabId);
        }
        appendLog("error", "检测到 Lark 和 Meegle 账号冲突，已阻止继续授权");
        return undefined;
      }

      state.identity.masterUserId = resolved.data.masterUserId;
      if (resolved.data.operatorLarkId) {
        state.identity.larkId = resolved.data.operatorLarkId;
      }
      if (resolved.data.larkEmail) {
        state.identity.larkEmail = resolved.data.larkEmail;
      }
      if (resolved.data.larkName) {
        state.identity.larkName = resolved.data.larkName;
      }
      if (resolved.data.larkAvatar) {
        state.identity.larkAvatar = resolved.data.larkAvatar;
      }
      if (resolved.data.meegleUserKey) {
        state.identity.meegleUserKey = resolved.data.meegleUserKey;
      }
      await saveResolvedIdentity(resolved.data.masterUserId);
      if (state.currentTabId != null) {
        await saveResolvedIdentityForTab(state.currentTabId, resolved.data.masterUserId);
      }
      return resolved.data.masterUserId;
    }

    return undefined;
  }

  async function hydrateLarkIdentityIfReady(): Promise<void> {
    const auth = state.larkAuth;
    if (auth?.status !== "ready" || !auth.masterUserId || !auth.baseUrl) {
      return;
    }

    await hydrateLarkIdentityFromServer(auth.masterUserId, auth.baseUrl);
  }

  async function hydrateLarkIdentityFromServer(
    masterUserId: string,
    baseUrl: string,
  ): Promise<void> {
    const userInfo = await fetchLarkUserInfo({
      masterUserId,
      baseUrl,
    });

    if (!userInfo.ok || !userInfo.data) {
      return;
    }

    if (userInfo.data.userId) {
      state.identity.larkId = userInfo.data.userId;
      settingsForm.larkUserId = userInfo.data.userId;
    }
    if (userInfo.data.email && !state.identity.larkEmail) {
      state.identity.larkEmail = userInfo.data.email;
    }
    if (userInfo.data.name && !state.identity.larkName) {
      state.identity.larkName = userInfo.data.name;
    }
    if (userInfo.data.avatarUrl && !state.identity.larkAvatar) {
      state.identity.larkAvatar = userInfo.data.avatarUrl;
    }
  }

  return {
    state,
    logs,
    isLoading,
    activePage,
    settingsOpen,
    settingsForm,
    viewModel,
    headerSubtitle,
    meegleStatus,
    larkStatus,
    topMeegleButtonText,
    topLarkButtonText,
    topMeegleButtonDisabled,
    topLarkButtonDisabled,
    larkActions,
    meegleActions,
    showKimiChat,
    kimiChatTranscript,
    kimiChatBusy,
    kimiChatSessionId,
    kimiChatDraftMessage,
    kimiChatHistoryOpen,
    kimiChatHistoryLoading,
    kimiChatHistoryItems,
    initialize,
    authorizeMeegle,
    authorizeLark,
    openSettings,
    closeSettings,
    fetchMeegleUserKey,
    saveSettingsForm,
    refreshServerConfig,
    clearLogs,
    exportLogs,
    runFeatureAction,
    resetKimiChatSession,
    openKimiChatHistory,
    closeKimiChatHistory,
    loadKimiChatHistorySession,
    deleteKimiChatHistorySession,
    updateKimiChatDraftMessage,
    sendKimiChatMessage,
    stopKimiChatGeneration,
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
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}

function resolveStatusChip(
  ready: boolean,
  fallbackValue?: string | null,
): PopupStatusChip {
  if (ready) {
    return {
      tone: "success",
      text: "已授权",
    };
  }

  if (fallbackValue) {
    return {
      tone: "processing",
      text: fallbackValue,
    };
  }

  return {
    tone: "default",
    text: "-",
  };
}

function formatExpiry(expiresAt?: string): string | undefined {
  if (!expiresAt) {
    return undefined;
  }

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const hours = `${parsed.getHours()}`.padStart(2, "0");
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function resolveLarkStatusChip(
  auth: LarkAuthEnsureResponse | undefined,
  fallbackValue?: string | null,
): PopupStatusChip {
  if (auth?.status === "ready") {
    const expiryText = formatExpiry(auth.expiresAt);
    return {
      tone: "success",
      text: expiryText ? `已授权 · ${expiryText}` : "已授权",
    };
  }

  return resolveStatusChip(false, fallbackValue);
}

function resolveMeegleStatusChip(
  auth: MeegleAuthEnsureResponse | undefined,
  meegleUserKey?: string | null,
): PopupStatusChip {
  const display = resolveMeegleStatusDisplay(auth, meegleUserKey || undefined);

  if (display.status === "ready") {
    return {
      tone: "success",
      text: display.text,
    };
  }

  if (display.status === "error") {
    return {
      tone: "error",
      text: display.text,
    };
  }

  if (display.text !== "-") {
    return {
      tone: "processing",
      text: display.text,
    };
  }

  return {
    tone: "default",
    text: display.text,
  };
}
