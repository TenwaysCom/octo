import { computed, reactive, ref } from "vue";
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
  fetchLarkUserInfo,
  getConfig,
  getLarkAuthStatus,
  loadPopupSettings,
  loadResolvedIdentity,
  queryActiveTabContext,
  requestLarkUserId,
  requestMeegleUserIdentity,
  resolveIdentityRequest,
  runLarkAuthRequest,
  runMeegleAuthRequest,
  runMeegleLarkPushRequest,
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
  normalizeLarkAuthBaseUrl,
  normalizeMeegleAuthBaseUrl,
} from "../../platform-url.js";
import { createExtensionLogger, exportLogsAsBlob } from "../../logger.js";
import { message } from "ant-design-vue";

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

function createDefaultSettingsForm(): PopupSettingsForm {
  return {
    SERVER_URL: "http://localhost:3000",
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
    {
      key: "draft",
      label: "生成草稿",
      type: "default",
      disabled: !viewModel.value.canDraft,
    },
    {
      key: "apply",
      label: "确认创建",
      type: "default",
      disabled: !viewModel.value.canApply,
    },
  ]);
  const meegleActions = computed<PopupFeatureAction[]>(() => [
    {
      key: "update-lark-and-push",
      label: "更新Lark及推送",
      type: "primary",
      disabled: false,
    },
    {
      key: "meegle-context",
      label: "查看来源上下文",
      type: "default",
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
        const userInfo = await fetchLarkUserInfo({
          masterUserId: auth.masterUserId,
          baseUrl: auth.baseUrl,
        });

        if (userInfo.ok && userInfo.data) {
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
    const labels: Record<string, string> = {
      analyze: "分析中...",
      draft: "生成草稿...",
      apply: "确认创建...",
      "meegle-context": "查看来源上下文...",
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
      return;
    }

    appendLog("warn", "功能开发中，请稍后");
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
  };
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
