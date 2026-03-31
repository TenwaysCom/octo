import { computed, reactive, ref } from "vue";
import type { LarkAuthEnsureResponse } from "../../types/lark.js";
import type { MeegleAuthEnsureResponse } from "../../types/meegle.js";
import {
  createMeegleAuthController,
  type PopupMeegleAuthLog,
} from "../meegle-auth.js";
import {
  getConfig,
  loadPopupSettings,
  queryActiveTabContext,
  requestLarkUserId,
  requestMeegleUserIdentity,
  runLarkAuthRequest,
  runMeegleAuthRequest,
  savePopupSettings,
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

interface PopupIdentityState {
  masterUserId: string | null;
  larkId: string | null;
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
    meegleUserKey: "",
    larkUserId: "",
  };
}

export function usePopupApp() {
  const logs = ref<PopupLogEntry[]>([]);
  const isLoading = ref(true);
  const hasResolvedPageContext = ref(false);
  const activePage = ref<PopupNotebookPage>("home");
  const state = reactive({
    pageType: "unsupported" as PopupPageType,
    currentTabId: null as number | null,
    currentTabOrigin: null as string | null,
    currentUrl: null as string | null,
    identity: {
      larkId: null,
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
      return "Settings";
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
    resolveStatusChip(state.isAuthed.meegle, state.identity.meegleUserKey),
  );
  const larkStatus = computed(() =>
    resolveStatusChip(state.isAuthed.lark, state.identity.larkId),
  );
  const topMeegleButtonText = computed(() =>
    state.isAuthed.meegle ? "已授权" : "授权",
  );
  const topLarkButtonText = computed(() =>
    state.isAuthed.lark ? "已授权" : "授权",
  );
  const topMeegleButtonDisabled = computed(() => state.isAuthed.meegle);
  const topLarkButtonDisabled = computed(() => state.isAuthed.lark);
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
      key: "meegle-context",
      label: "查看来源上下文",
      type: "primary",
      disabled: false,
    },
  ]);

  async function initialize() {
    appendLog("info", "初始化...");
    try {
      const settings = await loadPopupSettings();
      syncSettingsForm(settings);
      settingsSnapshot = { ...settings };
      hydrateIdentityFromSettings(settings);

      const tabContext = await queryActiveTabContext();
      state.currentTabId = tabContext.id;
      state.currentUrl = tabContext.url;
      state.currentTabOrigin = tabContext.origin;
      state.pageType = tabContext.pageType;
      hasResolvedPageContext.value = true;

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
        const identity = await requestMeegleUserIdentity(tabContext.id);
        if (identity?.userKey) {
          state.identity.meegleUserKey = identity.userKey;
        }
      }

      await refreshAuthStates();
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
    const [meegleAuth, larkAuth] = await Promise.all([
      checkMeegleAuth(),
      checkLarkAuth(),
    ]);

    state.meegleAuth = meegleAuth;
    state.larkAuth = larkAuth;
    state.isAuthed.meegle = meegleAuth.status === "ready";
    state.isAuthed.lark = larkAuth.status === "ready";
  }

  async function checkMeegleAuth(): Promise<MeegleAuthEnsureResponse> {
    const config = await getConfig();
    const settings = await loadPopupSettings();
    const meegleUserKey =
      settings.meegleUserKey || state.identity.meegleUserKey || undefined;

    try {
      const response = await fetch(`${config.SERVER_URL}/api/meegle/auth/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          masterUserId:
            state.identity.masterUserId || state.identity.larkId || settings.larkUserId || "usr_unknown",
          meegleUserKey,
          baseUrl: state.currentTabOrigin || config.MEEGLE_BASE_URL,
        }),
      });

      if (!response.ok) {
        return {
          status: "failed",
          baseUrl: state.currentTabOrigin || config.MEEGLE_BASE_URL,
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
          baseUrl: state.currentTabOrigin || config.MEEGLE_BASE_URL,
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
        baseUrl: state.currentTabOrigin || config.MEEGLE_BASE_URL,
        reason: "STATUS_REQUEST_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Meegle auth error.",
      };
    }
  }

  async function checkLarkAuth(): Promise<LarkAuthEnsureResponse> {
    return runLarkAuthRequest(
      state.currentTabOrigin || "https://open.larksuite.com",
    );
  }

  async function authorizeMeegle() {
    if (state.pageType === "meegle" && state.currentTabId != null) {
      const identity = await requestMeegleUserIdentity(state.currentTabId);
      if (identity?.userKey) {
        state.identity.meegleUserKey = identity.userKey;
      }
    }

    const success = await meegleAuthController.run({
      currentTabId: state.currentTabId ?? undefined,
      currentTabOrigin:
        state.currentTabOrigin || "https://project.larksuite.com",
      currentPageType: state.pageType,
      masterUserId:
        state.identity.masterUserId || state.identity.larkId || undefined,
      meegleUserKey: state.identity.meegleUserKey || undefined,
    });

    state.meegleAuth =
      meegleAuthController.getLastAuth() || state.meegleAuth;
    state.isAuthed.meegle = success;
  }

  async function authorizeLark() {
    appendLog("info", "检查 Lark 授权...");
    const auth = await checkLarkAuth();
    state.larkAuth = auth;
    state.isAuthed.lark = auth.status === "ready";

    if (auth.status === "ready") {
      appendLog("success", "Lark 已授权");
      return;
    }

    appendLog("warn", "需要登录 Lark");
  }

  function openSettings() {
    activePage.value = "settings";
  }

  function closeSettings() {
    syncSettingsForm(settingsSnapshot);
    activePage.value = "home";
  }

  async function saveSettingsForm() {
    await savePopupSettings({ ...settingsForm });
    settingsSnapshot = { ...settingsForm };
    hydrateIdentityFromSettings(settingsForm);
    appendLog("success", "设置已保存");
    activePage.value = "home";
    await refreshAuthStates();
  }

  function clearLogs() {
    logs.value = [];
  }

  function runFeatureAction(actionKey: string) {
    const labels: Record<string, string> = {
      analyze: "分析中...",
      draft: "生成草稿...",
      apply: "确认创建...",
      "meegle-context": "查看来源上下文...",
    };

    appendLog("info", labels[actionKey] || "执行操作中...");
    appendLog("warn", "功能开发中，请稍后");
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
  }

  function syncSettingsForm(settings: PopupSettingsForm) {
    settingsForm.SERVER_URL = settings.SERVER_URL;
    settingsForm.MEEGLE_PLUGIN_ID = settings.MEEGLE_PLUGIN_ID;
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
    saveSettingsForm,
    clearLogs,
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
