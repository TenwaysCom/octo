import type {
  LarkAuthEnsureResponse,
  LarkBaseBulkCreateResultPayload,
  LarkBaseBulkPreviewResultPayload,
} from "../types/lark.js";
import type { MeegleAuthEnsureResponse } from "../types/meegle.js";
import type {
  KimiChatSessionSummary,
  KimiChatTranscriptEntry,
} from "../types/acp-kimi.js";
import {
  clearResolvedIdentity,
  clearResolvedIdentityForTab,
  fetchLarkUserInfo,
  getConfig,
  getLarkAuthStatus,
  refreshLarkAuthStatus,
  loadPopupSettings,
  loadResolvedIdentity,
  postClientDebugLog,
  queryActiveTabContext,
  requestLarkUserId,
  requestMeegleUserIdentity,
  resolveIdentityRequest,
  runLarkAuthRequest,
  runMeegleAuthRequest,
  savePopupSettings,
  saveResolvedIdentity,
  saveResolvedIdentityForTab,
  watchLarkAuthCallbackResult,
} from "../popup/runtime.js";
import {
  createMeegleAuthController,
  resolveMeegleStatusDisplay,
  type PopupMeegleAuthLog,
} from "../popup/meegle-auth.js";
import {
  buildPopupHeaderContext,
  createPopupViewModel,
  type PopupPageType,
} from "../popup/view-model.js";
import type {
  PopupFeatureAction,
  PopupLogEntry,
  PopupLogLevel,
  PopupNotebookPage,
  PopupSettingsForm,
  PopupStatusChip,
} from "../popup/types.js";
import {
  normalizeLarkAuthBaseUrl,
  normalizeMeegleAuthBaseUrl,
} from "../platform-url.js";
import { extractLarkBaseContextFromUrl } from "../lark-base-url.js";
import { createExtensionLogger, exportLogsAsBlob } from "../logger.js";
import { showPopupToast } from "../popup/toast.js";

const popupLogger = createExtensionLogger("popup:app");
const LARK_BULK_CREATE_ACTION_KEY = "bulk-create-meegle-tickets";
const TARGET_LARK_BASE_ID = "XO0cbnxMIaralRsbBEolboEFgZc";
const TARGET_LARK_TABLE_ID = "tblUfu71xwdul3NH";
const TARGET_LARK_VIEW_ID = "vewMs17Tqk";

type LarkBulkCreateModalStage = "hidden" | "preview" | "executing" | "result" | "error";

export interface LarkBulkCreateModalError {
  errorCode?: string;
  errorMessage: string;
}

type LazyKimiChatController = {
  resetSession: () => void;
  openHistory: () => Promise<void>;
  loadHistorySession: (sessionId: string) => Promise<void>;
  deleteHistorySession: (sessionId: string) => Promise<void>;
  sendMessage: (messageText: string) => Promise<void>;
  stopGeneration: () => void;
  dispose: () => void;
};

type LazyLarkBulkCreateController = {
  openPreview: () => Promise<void>;
  confirmCreate: () => Promise<void>;
};

type LazyMeeglePushController = {
  run: () => Promise<void>;
};

export interface PopupIdentityState {
  masterUserId: string | null;
  larkId: string | null;
  larkEmail: string | null;
  larkName: string | null;
  larkAvatar: string | null;
  meegleUserKey: string | null;
}

export interface PopupAuthFlags {
  lark: boolean;
  meegle: boolean;
}

export interface LarkBulkCreateModalState {
  visible: boolean;
  stage: LarkBulkCreateModalStage;
  preview: Extract<LarkBaseBulkPreviewResultPayload, { ok: true }> | null;
  result: LarkBaseBulkCreateResultPayload | null;
  bulkError: LarkBulkCreateModalError | null;
}

export interface PopupAppState {
  pageType: PopupPageType;
  currentTabId: number | null;
  currentTabOrigin: string | null;
  currentUrl: string | null;
  identity: PopupIdentityState;
  isAuthed: PopupAuthFlags;
  meegleAuth: MeegleAuthEnsureResponse | undefined;
  larkAuth: LarkAuthEnsureResponse | undefined;
}

interface PopupAppStore {
  logs: PopupLogEntry[];
  isLoading: boolean;
  hasResolvedPageContext: boolean;
  activePage: PopupNotebookPage;
  showKimiChat: boolean;
  kimiChatBusy: boolean;
  kimiChatSessionId: string | null;
  kimiChatDraftMessage: string;
  kimiChatActiveAssistantEntryId: string | null;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatHistoryOpen: boolean;
  kimiChatHistoryLoading: boolean;
  kimiChatHistoryItems: KimiChatSessionSummary[];
  larkBulkCreateModal: LarkBulkCreateModalState;
  state: PopupAppState;
  settingsForm: PopupSettingsForm;
}

export interface PopupControllerState {
  state: PopupAppState;
  logs: PopupLogEntry[];
  isLoading: boolean;
  activePage: PopupNotebookPage;
  settingsOpen: boolean;
  settingsForm: PopupSettingsForm;
  viewModel: ReturnType<typeof createPopupViewModel>;
  headerSubtitle: string | null;
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  topMeegleButtonText: string;
  topLarkButtonText: string;
  topMeegleButtonDisabled: boolean;
  topLarkButtonDisabled: boolean;
  larkActions: PopupFeatureAction[];
  meegleActions: PopupFeatureAction[];
  larkBulkCreateModal: LarkBulkCreateModalState;
  showKimiChat: boolean;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatBusy: boolean;
  kimiChatSessionId: string | null;
  kimiChatDraftMessage: string;
  kimiChatHistoryOpen: boolean;
  kimiChatHistoryLoading: boolean;
  kimiChatHistoryItems: KimiChatSessionSummary[];
}

type PopupIdentityCompatInput = Partial<PopupIdentityState>;

function createDefaultSettingsForm(): PopupSettingsForm {
  return {
    SERVER_URL: "https://octo.odoo.tenways.it:18443",
    MEEGLE_PLUGIN_ID: "",
    LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    meegleUserKey: "",
    larkUserId: "",
  };
}

function createInitialStore(): PopupAppStore {
  return {
    logs: [],
    isLoading: true,
    hasResolvedPageContext: false,
    activePage: "automation",
    showKimiChat: false,
    kimiChatBusy: false,
    kimiChatSessionId: null,
    kimiChatDraftMessage: "",
    kimiChatActiveAssistantEntryId: null,
    kimiChatTranscript: [],
    kimiChatHistoryOpen: false,
    kimiChatHistoryLoading: false,
    kimiChatHistoryItems: [],
    larkBulkCreateModal: {
      visible: false,
      stage: "hidden",
      preview: null,
      result: null,
      bulkError: null,
    },
    state: {
      pageType: "unsupported",
      currentTabId: null,
      currentTabOrigin: null,
      currentUrl: null,
      identity: {
        masterUserId: null,
        larkId: null,
        larkEmail: null,
        larkName: null,
        larkAvatar: null,
        meegleUserKey: null,
      },
      isAuthed: {
        lark: false,
        meegle: false,
      },
      meegleAuth: undefined,
      larkAuth: undefined,
    },
    settingsForm: createDefaultSettingsForm(),
  };
}

export function createPopupController() {
  const storeRef = { current: createInitialStore() };
  let cachedState: PopupControllerState | null = null;
  const settingsSnapshotRef = { current: createDefaultSettingsForm() };
  const meegleAuthControllerRef = { current: null as ReturnType<
    typeof createMeegleAuthController
  > | null };
  const listeners = new Set<() => void>();
  let kimiChatController: LazyKimiChatController | null = null;
  let kimiChatControllerPromise: Promise<LazyKimiChatController> | null = null;
  let larkBulkCreateController: LazyLarkBulkCreateController | null = null;
  let larkBulkCreateControllerPromise: Promise<LazyLarkBulkCreateController> | null =
    null;
  let larkBulkCreateConfirmPromise: Promise<void> | null = null;
  let meeglePushController: LazyMeeglePushController | null = null;
  let meeglePushControllerPromise: Promise<LazyMeeglePushController> | null = null;
  let disposed = false;

  function updateStore(updater: (previous: PopupAppStore) => PopupAppStore): void {
    const previous = storeRef.current;
    const next = updater(previous);
    storeRef.current = next;
    cachedState = null;
    if (previous.activePage !== next.activePage) {
      popupLogger.info("activePage.changed", {
        previousPage: previous.activePage,
        nextPage: next.activePage,
      });
      void postClientDebugLog({
        source: "popup:app",
        level: "info",
        event: "activePage.changed",
        detail: {
          previousPage: previous.activePage,
          nextPage: next.activePage,
        },
      });
    }
    for (const listener of listeners) {
      listener();
    }
  }

  function readStore(): PopupAppStore {
    return storeRef.current;
  }

  function showToast(text: string, level: PopupLogLevel = "info"): void {
    showPopupToast(text, level);
  }

  function setLarkBulkCreateModal(
    next:
      | LarkBulkCreateModalState
      | ((previous: LarkBulkCreateModalState) => LarkBulkCreateModalState),
  ): void {
    updateStore((previous) => ({
      ...previous,
      larkBulkCreateModal:
        typeof next === "function" ? next(previous.larkBulkCreateModal) : next,
    }));
  }

  async function loadKimiChatController(): Promise<LazyKimiChatController> {
    if (kimiChatController) {
      return kimiChatController;
    }

    if (!kimiChatControllerPromise) {
      kimiChatControllerPromise = import("./popup-kimi-chat-controller.js").then(
        ({ createKimiChatController }) => {
          const controller = createKimiChatController({
            readStore,
            updateStore,
            appendLog,
            postClientDebugLog,
          });

          if (disposed) {
            controller.dispose();
          } else {
            kimiChatController = controller;
          }

          return controller;
        },
      );
    }

    return kimiChatControllerPromise;
  }

  async function loadLarkBulkCreateController(): Promise<LazyLarkBulkCreateController> {
    if (larkBulkCreateController) {
      return larkBulkCreateController;
    }

    if (!larkBulkCreateControllerPromise) {
      larkBulkCreateControllerPromise = import(
        "./popup-lark-bulk-create-controller.js"
      ).then(({ createLarkBulkCreateController }) => {
        const controller = createLarkBulkCreateController({
          readStore,
          appendLog,
          showToast,
          setModalState: setLarkBulkCreateModal,
          openErrorModal: openLarkBulkCreateErrorModal,
        });

        larkBulkCreateController = controller;
        return controller;
      });
    }

    return larkBulkCreateControllerPromise;
  }

  async function loadMeeglePushController(): Promise<LazyMeeglePushController> {
    if (meeglePushController) {
      return meeglePushController;
    }

    if (!meeglePushControllerPromise) {
      meeglePushControllerPromise = import("./popup-meegle-push-controller.js").then(
        ({ createMeeglePushController }) => {
          const controller = createMeeglePushController({
            readStore,
            appendLog,
            showToast,
            setActivePage,
            updateCurrentTabUrl(tabId, url) {
              void chrome.tabs.update(tabId, { url });
            },
          });

          meeglePushController = controller;
          return controller;
        },
      );
    }

    return meeglePushControllerPromise;
  }

  function preloadKimiChatController(): void {
    void loadKimiChatController();
  }

  function appendLog(level: PopupLogLevel, message: string): void {
    updateStore((previous) => ({
      ...previous,
      logs: [
        ...previous.logs,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          level,
          message,
          timestamp: new Date().toLocaleTimeString(),
        },
      ],
    }));

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

  if (!meegleAuthControllerRef.current) {
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

    meegleAuthControllerRef.current = createMeegleAuthController({
      sendMessage: runMeegleAuthRequest,
      setStatus: () => {
        // React derives status display from state.
      },
      log: logAdapter,
    });
  }

  function syncSettingsForm(settings: PopupSettingsForm): void {
    updateStore((previous) => ({
      ...previous,
      settingsForm: {
        ...settings,
      },
    }));
  }

  function hydrateIdentityFromSettings(settings: PopupSettingsForm): void {
    updateStore((previous) => ({
      ...previous,
      state: {
        ...previous.state,
        identity: {
          ...previous.state.identity,
          meegleUserKey: settings.meegleUserKey || previous.state.identity.meegleUserKey,
          larkId: settings.larkUserId || previous.state.identity.larkId,
        },
      },
    }));
  }

  async function checkMeegleAuth(): Promise<MeegleAuthEnsureResponse> {
    const current = readStore();
    const config = await getConfig();
    const settings = await loadPopupSettings();
    const authBaseUrl = normalizeMeegleAuthBaseUrl(
      current.state.currentTabOrigin,
      config.MEEGLE_BASE_URL,
    );
    const meegleUserKey =
      settings.meegleUserKey || current.state.identity.meegleUserKey || undefined;
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
    const current = readStore();
    const status = await getLarkAuthStatus({
      masterUserId: current.state.identity.masterUserId || undefined,
      baseUrl: normalizeLarkAuthBaseUrl(current.state.currentTabOrigin),
    });

    if (status.status !== "require_refresh") {
      return status;
    }

    return refreshLarkAuthStatus({
      masterUserId: current.state.identity.masterUserId || undefined,
      baseUrl: status.baseUrl,
    });
  }

  async function refreshAuthStates(): Promise<void> {
    await Promise.allSettled([
      (async () => {
        try {
          const meegleAuth = await checkMeegleAuth();
          updateStore((previous) => ({
            ...previous,
            state: {
              ...previous.state,
              meegleAuth,
              isAuthed: {
                ...previous.state.isAuthed,
                meegle: meegleAuth.status === "ready",
              },
            },
          }));
        } catch (error) {
          const current = readStore();
          updateStore((previous) => ({
            ...previous,
            state: {
              ...previous.state,
              meegleAuth: {
                status: "failed",
                baseUrl:
                  current.state.currentTabOrigin || "https://project.larksuite.com",
                reason: "STATUS_REQUEST_FAILED",
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              },
              isAuthed: {
                ...previous.state.isAuthed,
                meegle: false,
              },
            },
          }));
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
          updateStore((previous) => ({
            ...previous,
            state: {
              ...previous.state,
              larkAuth,
              isAuthed: {
                ...previous.state.isAuthed,
                lark: larkAuth.status === "ready",
              },
            },
          }));
        } catch (error) {
          const current = readStore();
          updateStore((previous) => ({
            ...previous,
            state: {
              ...previous.state,
              larkAuth: {
                status: "failed",
                baseUrl: current.state.currentTabOrigin || "https://open.larksuite.com",
                reason: "BACKGROUND_ERROR",
              },
              isAuthed: {
                ...previous.state.isAuthed,
                lark: false,
              },
            },
          }));
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

  async function ensureResolvedIdentity(): Promise<string | undefined> {
    const current = readStore();

    if (!current.state.currentTabOrigin) {
      return current.state.identity.masterUserId || undefined;
    }

    const pathname = current.state.currentUrl
      ? new URL(current.state.currentUrl).pathname
      : "/";

    const resolved = await resolveIdentityRequest({
      masterUserId: current.state.identity.masterUserId || undefined,
      operatorLarkId: current.state.identity.larkId || undefined,
      meegleUserKey: current.state.identity.meegleUserKey || undefined,
      pageContext: {
        platform:
          current.state.pageType === "lark" || current.state.pageType === "meegle"
            ? current.state.pageType
            : "unknown",
        baseUrl: current.state.currentTabOrigin,
        pathname,
      },
    });

    if (resolved.ok && resolved.data?.masterUserId) {
      if (resolved.data.identityStatus === "conflict") {
        updateStore((previous) => ({
          ...previous,
          state: {
            ...previous.state,
            identity: {
              ...previous.state.identity,
              masterUserId: null,
            },
          },
        }));

        await clearResolvedIdentity();
        if (current.state.currentTabId != null) {
          await clearResolvedIdentityForTab(current.state.currentTabId);
        }
        appendLog("error", "检测到 Lark 和 Meegle 账号冲突，已阻止继续授权");
        return undefined;
      }

      updateStore((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          identity: {
            ...previous.state.identity,
            masterUserId: resolved.data?.masterUserId ?? previous.state.identity.masterUserId,
            larkId: resolved.data?.operatorLarkId ?? previous.state.identity.larkId,
            larkEmail: resolved.data?.larkEmail ?? previous.state.identity.larkEmail,
            larkName: resolved.data?.larkName ?? previous.state.identity.larkName,
            larkAvatar: resolved.data?.larkAvatar ?? previous.state.identity.larkAvatar,
            meegleUserKey:
              resolved.data?.meegleUserKey ?? previous.state.identity.meegleUserKey,
          },
        },
      }));

      await saveResolvedIdentity(resolved.data.masterUserId);
      if (current.state.currentTabId != null) {
        await saveResolvedIdentityForTab(
          current.state.currentTabId,
          resolved.data.masterUserId,
        );
      }
      return resolved.data.masterUserId;
    }

    return undefined;
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

    updateStore((previous) => ({
      ...previous,
      settingsForm: {
        ...previous.settingsForm,
        larkUserId: userInfo.data?.userId || previous.settingsForm.larkUserId,
      },
      state: {
        ...previous.state,
        identity: {
          ...previous.state.identity,
          larkId: userInfo.data?.userId || previous.state.identity.larkId,
          larkEmail: previous.state.identity.larkEmail || userInfo.data.email || null,
          larkName: previous.state.identity.larkName || userInfo.data.name || null,
          larkAvatar:
            previous.state.identity.larkAvatar || userInfo.data.avatarUrl || null,
        },
      },
    }));
  }

  async function hydrateLarkIdentityIfReady(): Promise<void> {
    const current = readStore();
    const auth = current.state.larkAuth;

    if (auth?.status !== "ready" || !auth.masterUserId || !auth.baseUrl) {
      return;
    }

    await hydrateLarkIdentityFromServer(auth.masterUserId, auth.baseUrl);
  }

  async function initialize(): Promise<void> {
    appendLog("info", "初始化...");

    try {
      const settings = await loadPopupSettings();
      syncSettingsForm(settings);
      settingsSnapshotRef.current = { ...settings };
      hydrateIdentityFromSettings(settings);

      const resolvedIdentity = await loadResolvedIdentity();
      if (resolvedIdentity) {
        updateStore((previous) => ({
          ...previous,
          state: {
            ...previous.state,
            identity: {
              ...previous.state.identity,
              masterUserId: resolvedIdentity,
            },
          },
        }));
      }

      const tabContext = await queryActiveTabContext();
      updateStore((previous) => ({
        ...previous,
        hasResolvedPageContext: true,
        state: {
          ...previous.state,
          currentTabId: tabContext.id,
          currentUrl: tabContext.url,
          currentTabOrigin: tabContext.origin,
          pageType: tabContext.pageType,
        },
      }));

      appendLog(
        "info",
        `检测到页面: ${tabContext.url || "(空)"} · 类型: ${tabContext.pageType}`,
      );

      if (tabContext.pageType === "unsupported") {
        appendLog("warn", "当前页面不支持");
        return;
      }

      if (tabContext.pageType === "lark" && tabContext.id != null) {
        const larkId = await requestLarkUserId(tabContext.id);
        if (larkId) {
          updateStore((previous) => ({
            ...previous,
            state: {
              ...previous.state,
              identity: {
                ...previous.state.identity,
                larkId,
              },
            },
          }));
        }
      }

      if (tabContext.pageType === "meegle" && tabContext.id != null) {
        const identity = await requestMeegleUserIdentity(
          tabContext.id,
          tabContext.url ?? undefined,
        );
        if (identity?.userKey) {
          const userKey = identity.userKey;
          updateStore((previous) => ({
            ...previous,
            state: {
              ...previous.state,
              identity: {
                ...previous.state.identity,
                meegleUserKey: userKey,
              },
            },
          }));
        }
      }

      await ensureResolvedIdentity();
      await refreshAuthStates();
      await hydrateLarkIdentityIfReady();

      const current = readStore();
      if (!current.state.isAuthed.lark || !current.state.isAuthed.meegle) {
        updateStore((previous) => ({
          ...previous,
          activePage: "profile",
        }));
        appendLog("warn", "Lark 或 Meegle 未授权，已切换到个人页面");
      }

      appendLog("success", "初始化完成");
    } catch (error) {
      appendLog(
        "error",
        `初始化失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      updateStore((previous) => ({
        ...previous,
        isLoading: false,
      }));
    }
  }

  async function authorizeMeegle(): Promise<void> {
    const current = readStore();
    const config = await getConfig();

    if (current.state.pageType === "meegle" && current.state.currentTabId != null) {
      const identity = await requestMeegleUserIdentity(
        current.state.currentTabId,
        current.state.currentUrl ?? undefined,
      );
      if (identity?.userKey) {
        const userKey = identity.userKey;
        updateStore((previous) => ({
          ...previous,
          state: {
            ...previous.state,
            identity: {
              ...previous.state.identity,
              meegleUserKey: userKey,
            },
          },
        }));
      }
    }

    const masterUserId = await ensureResolvedIdentity();

    if (!masterUserId) {
      appendLog("error", "无法解析主身份，暂时不能发起 Meegle 授权");
      updateStore((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          isAuthed: {
            ...previous.state.isAuthed,
            meegle: false,
          },
        },
      }));
      return;
    }

    const success = await meegleAuthControllerRef.current!.run({
      currentTabId: current.state.currentTabId ?? undefined,
      currentTabOrigin: current.state.currentTabOrigin || undefined,
      authBaseUrl: normalizeMeegleAuthBaseUrl(
        current.state.currentTabOrigin,
        config.MEEGLE_BASE_URL,
      ),
      currentPageType: current.state.pageType,
      masterUserId,
      meegleUserKey: readStore().state.identity.meegleUserKey || undefined,
    });

    updateStore((previous) => ({
      ...previous,
      state: {
        ...previous.state,
        meegleAuth:
          meegleAuthControllerRef.current?.getLastAuth() || previous.state.meegleAuth,
        isAuthed: {
          ...previous.state.isAuthed,
          meegle: success,
        },
      },
    }));
  }

  async function authorizeLark(): Promise<void> {
    appendLog("info", "检查 Lark 授权...");
    const masterUserId = await ensureResolvedIdentity();

    if (!masterUserId) {
      appendLog("error", "无法解析主身份，暂时不能发起 Lark 授权");
      updateStore((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          isAuthed: {
            ...previous.state.isAuthed,
            lark: false,
          },
        },
      }));
      return;
    }

    const auth = await checkLarkAuth();
    updateStore((previous) => ({
      ...previous,
      state: {
        ...previous.state,
        larkAuth: auth,
        isAuthed: {
          ...previous.state.isAuthed,
          lark: auth.status === "ready",
        },
      },
    }));

    const current = readStore();
    const force = auth.status === "ready";
    if (force) {
      appendLog("info", "重新发起 Lark 授权...");
    }

    const started = await runLarkAuthRequest({
      masterUserId,
      baseUrl: normalizeLarkAuthBaseUrl(current.state.currentTabOrigin),
      force,
    });

    updateStore((previous) => ({
      ...previous,
      state: {
        ...previous.state,
        larkAuth: started,
        isAuthed: {
          ...previous.state.isAuthed,
          lark: started.status === "ready",
        },
      },
    }));

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

  function setActivePage(nextPage: PopupNotebookPage): void {
    updateStore((previous) => ({
      ...previous,
      activePage: nextPage,
    }));
  }

  function openSettings(): void {
    setActivePage("settings");
  }

  function closeSettings(): void {
    syncSettingsForm(settingsSnapshotRef.current);
    setActivePage("chat");
  }

  function setSettingsForm(
    next:
      | PopupSettingsForm
      | ((previous: PopupSettingsForm) => PopupSettingsForm),
  ): void {
    updateStore((previous) => ({
      ...previous,
      settingsForm:
        typeof next === "function" ? next(previous.settingsForm) : { ...next },
    }));
  }

  function updateSettingsFormField<TKey extends keyof PopupSettingsForm>(
    key: TKey,
    value: PopupSettingsForm[TKey],
  ): void {
    updateStore((previous) => ({
      ...previous,
      settingsForm: {
        ...previous.settingsForm,
        [key]: value,
      },
    }));
  }

  function syncLegacyIdentityState(nextIdentity: PopupIdentityCompatInput): void {
    updateStore((previous) => {
      const currentIdentity = previous.state.identity;
      const normalizedIdentity: PopupIdentityState = {
        masterUserId: normalizeIdentityField(
          nextIdentity.masterUserId,
          currentIdentity.masterUserId,
        ),
        larkId: normalizeIdentityField(nextIdentity.larkId, currentIdentity.larkId),
        larkEmail: normalizeIdentityField(
          nextIdentity.larkEmail,
          currentIdentity.larkEmail,
        ),
        larkName: normalizeIdentityField(nextIdentity.larkName, currentIdentity.larkName),
        larkAvatar: normalizeIdentityField(
          nextIdentity.larkAvatar,
          currentIdentity.larkAvatar,
        ),
        meegleUserKey: normalizeIdentityField(
          nextIdentity.meegleUserKey,
          currentIdentity.meegleUserKey,
        ),
      };

      if (areIdentityStatesEqual(currentIdentity, normalizedIdentity)) {
        return previous;
      }

      return {
        ...previous,
        state: {
          ...previous.state,
          identity: normalizedIdentity,
        },
      };
    });
  }

  async function fetchMeegleUserKey(): Promise<void> {
    const current = readStore();

    if (current.state.pageType !== "meegle" || current.state.currentTabId == null) {
      appendLog("warn", "当前标签页不是 Meegle 页面，无法自动获取 User Key");
      return;
    }

    const identity = await requestMeegleUserIdentity(
      current.state.currentTabId,
      current.state.currentUrl ?? undefined,
    );

    if (!identity?.userKey) {
      appendLog("warn", "未能从当前页面获取 Meegle User Key");
      return;
    }

    const userKey = identity.userKey;
    updateStore((previous) => ({
      ...previous,
      settingsForm: {
        ...previous.settingsForm,
        meegleUserKey: userKey,
      },
      state: {
        ...previous.state,
        identity: {
          ...previous.state.identity,
          meegleUserKey: userKey,
        },
      },
    }));
    appendLog("success", `已获取 Meegle User Key: ${userKey}`);
  }

  async function saveSettingsForm(): Promise<void> {
    const currentSettings = readStore().settingsForm;
    await savePopupSettings({ ...currentSettings });
    const refreshedSettings = await loadPopupSettings();
    syncSettingsForm(refreshedSettings);
    settingsSnapshotRef.current = { ...refreshedSettings };
    hydrateIdentityFromSettings(refreshedSettings);
    appendLog("success", "设置已保存");
    setActivePage("chat");
    await refreshAuthStates();
  }

  async function refreshServerConfig(): Promise<void> {
    const refreshedSettings = await loadPopupSettings();
    syncSettingsForm(refreshedSettings);
    settingsSnapshotRef.current = { ...refreshedSettings };
    appendLog(
      "success",
      `已刷新服务端配置: ${refreshedSettings.LARK_OAUTH_CALLBACK_URL}`,
    );
  }

  function clearLogs(): void {
    updateStore((previous) => ({
      ...previous,
      logs: [],
    }));
  }

  function openLarkBulkCreateErrorModal(error: LarkBulkCreateModalError): void {
    setLarkBulkCreateModal({
      visible: true,
      stage: "error",
      preview: null,
      result: null,
      bulkError: error,
    });
  }

  function confirmLarkBulkCreate(): Promise<void> {
    const currentModal = readStore().larkBulkCreateModal;

    if (currentModal.stage !== "preview" || !currentModal.preview) {
      return Promise.resolve();
    }

    if (larkBulkCreateConfirmPromise) {
      return larkBulkCreateConfirmPromise;
    }

    setLarkBulkCreateModal((previous) => {
      if (!previous.preview || previous.stage !== "preview") {
        return previous;
      }

      return {
        ...previous,
        visible: true,
        stage: "executing",
        result: null,
        bulkError: null,
      };
    });

    larkBulkCreateConfirmPromise = loadLarkBulkCreateController()
      .then((controller) => controller.confirmCreate())
      .finally(() => {
        larkBulkCreateConfirmPromise = null;
      });

    return larkBulkCreateConfirmPromise;
  }

  function closeLarkBulkCreateModal(): void {
    updateStore((previous) => ({
      ...previous,
      larkBulkCreateModal: {
        visible: false,
        stage: "hidden",
        preview: null,
        result: null,
        bulkError: null,
      },
    }));
  }

  function openKimiChat(): void {
    setActivePage("chat");

    if (readStore().showKimiChat) {
      return;
    }

    updateStore((previous) => ({
      ...previous,
      showKimiChat: true,
    }));
    preloadKimiChatController();
  }

  function resetKimiChatSession(): void {
    if (kimiChatController) {
      kimiChatController.resetSession();
      return;
    }

    void loadKimiChatController().then((controller) => {
      controller.resetSession();
    });
  }

  function updateKimiChatDraftMessage(message: string): void {
    updateStore((previous) => ({
      ...previous,
      kimiChatDraftMessage: message,
    }));
  }

  function stopKimiChatGeneration(): void {
    if (!readStore().kimiChatBusy) {
      return;
    }

    if (kimiChatController) {
      kimiChatController.stopGeneration();
      return;
    }

    void loadKimiChatController().then((controller) => {
      controller.stopGeneration();
    });
  }

  async function openKimiChatHistory(): Promise<void> {
    const controller = await loadKimiChatController();
    await controller.openHistory();
  }

  function closeKimiChatHistory(): void {
    updateStore((previous) => ({
      ...previous,
      kimiChatHistoryOpen: false,
    }));
  }

  async function loadKimiChatHistorySession(sessionId: string): Promise<void> {
    const controller = await loadKimiChatController();
    await controller.loadHistorySession(sessionId);
  }

  async function deleteKimiChatHistorySession(sessionId: string): Promise<void> {
    const controller = await loadKimiChatController();
    await controller.deleteHistorySession(sessionId);
  }

  async function sendKimiChatMessage(messageText: string): Promise<void> {
    updateStore((previous) => ({
      ...previous,
      showKimiChat: true,
      activePage: "chat",
    }));

    const controller = await loadKimiChatController();
    await controller.sendMessage(messageText);
  }

  async function runFeatureAction(actionKey: string): Promise<void> {
    if (actionKey === "analyze") {
      if (readStore().showKimiChat) {
        resetKimiChatSession();
        appendLog("info", "已重置 Kimi ACP 会话");
        return;
      }

      openKimiChat();
      appendLog("info", "已打开 Kimi ACP 聊天面板");
      return;
    }

    if (actionKey === LARK_BULK_CREATE_ACTION_KEY) {
      const controller = await loadLarkBulkCreateController();
      await controller.openPreview();
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
      const controller = await loadMeeglePushController();
      await controller.run();
      return;
    }

    appendLog("warn", "功能开发中，请稍后");
  }

  function exportLogs(): void {
    const blob = exportLogsAsBlob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tenways-octo-logs-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    appendLog("info", "日志已导出");
  }

  const unsubscribeLarkAuthCallback = watchLarkAuthCallbackResult(async (result) => {
    const current = readStore();

    if (
      result.masterUserId &&
      result.masterUserId !== current.state.identity.masterUserId
    ) {
      updateStore((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          identity: {
            ...previous.state.identity,
            masterUserId: result.masterUserId || null,
          },
        },
      }));
      await saveResolvedIdentity(result.masterUserId);
      if (current.state.currentTabId != null) {
        await saveResolvedIdentityForTab(
          current.state.currentTabId,
          result.masterUserId,
        );
      }
    }

    if (result.status === "ready") {
      appendLog("success", "Lark 授权完成");
      const auth = await checkLarkAuth();
      updateStore((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          larkAuth: auth,
          isAuthed: {
            ...previous.state.isAuthed,
            lark: auth.status === "ready",
          },
        },
      }));

      if (auth.status === "ready" && auth.masterUserId && auth.baseUrl) {
        await hydrateLarkIdentityFromServer(auth.masterUserId, auth.baseUrl);
      }
      return;
    }

    appendLog("error", `Lark 授权失败: ${result.reason || "Unknown error"}`);
  });

  function getState(): PopupControllerState {
    if (cachedState) {
      return cachedState;
    }

    const store = storeRef.current;
    const settingsOpen = store.activePage === "settings";
    const viewModel = createPopupViewModel({
      pageType: store.state.pageType,
      identity: store.state.identity,
      isAuthed: store.state.isAuthed,
    });
    const headerSubtitle = (() => {
    if (store.activePage === "settings") {
      return "设置";
    }

    if (store.activePage === "profile") {
      return "个人";
    }

    if (!store.hasResolvedPageContext) {
      return store.isLoading ? "Scanning" : null;
    }

    if (store.state.pageType === "unsupported") {
      return "Unsupported";
    }

    return buildPopupHeaderContext({
      platform: store.state.pageType === "lark" ? "Lark" : "Meegle",
    });
    })();
    const meegleStatus = resolveMeegleStatusChip(
      store.state.meegleAuth,
      store.state.identity.meegleUserKey,
    );
    const larkStatus = resolveLarkStatusChip(
      store.state.larkAuth,
      store.state.identity.larkId,
    );
    const topMeegleButtonText = store.state.isAuthed.meegle ? "已授权" : "授权";
    const topLarkButtonText = store.state.isAuthed.lark ? "重新授权" : "授权";
    const topMeegleButtonDisabled = store.state.isAuthed.meegle;
    const topLarkButtonDisabled = false;
    const currentLarkBaseContext = extractLarkBaseContextFromUrl(
      store.state.currentUrl ?? undefined,
    );
    const showLarkBulkCreateAction =
      store.state.pageType === "lark" &&
      viewModel.showLarkFeatureBlock &&
      currentLarkBaseContext.baseId === TARGET_LARK_BASE_ID &&
      currentLarkBaseContext.tableId === TARGET_LARK_TABLE_ID &&
      currentLarkBaseContext.viewId === TARGET_LARK_VIEW_ID;
    const larkActions: PopupFeatureAction[] = (() => {
    const actions: PopupFeatureAction[] = [
      {
        key: "analyze",
        label: "分析当前页面",
        type: "primary",
        disabled: !viewModel.canAnalyze,
      },
    ];

    if (showLarkBulkCreateAction) {
      actions.push({
        key: LARK_BULK_CREATE_ACTION_KEY,
        label: "批量创建 MEEGLE TICKET",
        type: "default",
        disabled: false,
      });
    }

    return actions;
    })();
    const meegleActions: PopupFeatureAction[] = [
      {
        key: "update-lark-and-push",
        label: "更新Lark及推送",
        type: "primary",
        disabled: false,
      },
    ];

    cachedState = freezeSnapshot(
      cloneData({
      state: store.state,
      logs: store.logs,
      isLoading: store.isLoading,
      activePage: store.activePage,
      settingsOpen,
      settingsForm: store.settingsForm,
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
      larkBulkCreateModal: store.larkBulkCreateModal,
      showKimiChat: store.showKimiChat,
      kimiChatTranscript: store.kimiChatTranscript,
      kimiChatBusy: store.kimiChatBusy,
      kimiChatSessionId: store.kimiChatSessionId,
      kimiChatDraftMessage: store.kimiChatDraftMessage,
      kimiChatHistoryOpen: store.kimiChatHistoryOpen,
      kimiChatHistoryLoading: store.kimiChatHistoryLoading,
      kimiChatHistoryItems: store.kimiChatHistoryItems,
      }),
    );

    return cachedState;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    disposed = true;
    unsubscribeLarkAuthCallback?.();
    if (kimiChatController) {
      kimiChatController.dispose();
    } else if (kimiChatControllerPromise) {
      void kimiChatControllerPromise.then((controller) => {
        controller.dispose();
      });
    }
    listeners.clear();
  }

  return {
    getState,
    subscribe,
    dispose,
    initialize,
    authorizeMeegle,
    authorizeLark,
    setActivePage,
    openSettings,
    closeSettings,
    setSettingsForm,
    updateSettingsFormField,
    syncLegacyIdentityState,
    fetchMeegleUserKey,
    saveSettingsForm,
    refreshServerConfig,
    clearLogs,
    exportLogs,
    runFeatureAction,
    confirmLarkBulkCreate,
    closeLarkBulkCreateModal,
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

function cloneData<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeSnapshot<T>(value: T): T {
  const seen = new WeakSet<object>();

  function freezeNested(current: unknown): void {
    if (!current || typeof current !== "object") {
      return;
    }

    if (seen.has(current)) {
      return;
    }
    seen.add(current);

    Object.freeze(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        freezeNested(item);
      }
      return;
    }

    for (const nested of Object.values(current)) {
      freezeNested(nested);
    }
  }

  freezeNested(value);
  return value;
}

function normalizeIdentityField(
  nextValue: string | null | undefined,
  fallbackValue: string | null,
): string | null {
  if (nextValue === undefined) {
    return fallbackValue;
  }

  if (nextValue === "") {
    return null;
  }

  return nextValue;
}

function areIdentityStatesEqual(
  left: PopupIdentityState,
  right: PopupIdentityState,
): boolean {
  return (
    left.masterUserId === right.masterUserId &&
    left.larkId === right.larkId &&
    left.larkEmail === right.larkEmail &&
    left.larkName === right.larkName &&
    left.larkAvatar === right.larkAvatar &&
    left.meegleUserKey === right.meegleUserKey
  );
}
