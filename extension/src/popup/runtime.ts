import {
  DEFAULT_CONFIG,
  getConfig,
} from "../background/config.js";
import {
  clearResolvedIdentity as clearStoredResolvedIdentity,
  clearResolvedIdentityForTab as clearStoredResolvedIdentityForTab,
  deleteKimiChatTranscriptSnapshot as deleteStoredKimiChatTranscriptSnapshot,
  getKimiChatTranscriptSnapshot as getStoredKimiChatTranscriptSnapshot,
  getStoredMasterUserId,
  getResolvedIdentityForTab as getStoredResolvedIdentityForTab,
  saveKimiChatTranscriptSnapshot as persistKimiChatTranscriptSnapshot,
  saveResolvedIdentity as persistResolvedIdentity,
  saveResolvedIdentityForTab as persistResolvedIdentityForTab,
} from "../background/storage.js";
import type {
  LarkAuthCallbackResult,
  LarkAuthEnsureResponse,
  LarkAuthStatusServerResponse,
  LarkBaseBulkWorkflowRequest,
  LarkBaseBulkPreviewResultPayload,
  LarkBaseBulkCreateResultPayload,
} from "../types/lark.js";
import type {
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
  MeegleLarkPushRequest,
  MeegleLarkPushResponse,
} from "../types/meegle.js";
import type {
  KimiChatEvent,
  KimiChatTranscriptEntry,
  KimiChatSessionSummary,
} from "../types/acp-kimi.js";
import type { PopupSettingsForm } from "./types.js";
import { detectPopupPageType, type PopupPageType } from "./view-model.js";
import { createExtensionLogger } from "../logger.js";
import { fetchServerJson } from "../server-request.js";

interface RuntimeErrorResponse {
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
  payload?: unknown;
}

const runtimeLogger = createExtensionLogger("popup:runtime");

function summarizeIdentifier(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export interface PopupTabContext {
  id: number | null;
  url: string | null;
  origin: string | null;
  pageType: PopupPageType;
  larkUserId?: string;
  meegleUserKey?: string;
}

export interface IdentityResolveResponse {
  ok: boolean;
  data?: {
    masterUserId: string;
    identityStatus: "pending_lark_identity" | "active" | "conflict";
    operatorLarkId?: string;
    larkEmail?: string;
    larkName?: string;
    larkAvatar?: string;
    meegleUserKey?: string;
    role?: string;
  };
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
}

export interface KimiChatSessionListResponse {
  ok: boolean;
  data?: {
    sessions: KimiChatSessionSummary[];
  };
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
}

export interface KimiChatSessionLoadResponse {
  ok: boolean;
  data?: {
    sessionId: string;
    events: KimiChatEvent[];
  };
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
}

export interface KimiChatTranscriptSnapshot {
  operatorLarkId: string;
  sessionId: string;
  transcript: KimiChatTranscriptEntry[];
  updatedAt: string;
}

export async function postClientDebugLog(input: {
  source: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  detail?: Record<string, unknown>;
}): Promise<boolean> {
  const config = await getConfig();
  if (!config.CLIENT_DEBUG_LOG_UPLOAD_ENABLED) {
    return false;
  }

  try {
    const masterUserId = await getStoredMasterUserId();
    const { response } = await fetchServerJson<{ ok: boolean }>({
      url: `${config.SERVER_URL}/api/debug/client-log`,
      masterUserId,
      keepalive: true,
      body: input,
    });

    return response.ok;
  } catch (error) {
    runtimeLogger.warn("postClientDebugLog.failed", {
      source: input.source,
      event: input.event,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function getChromeApi(): typeof chrome {
  if (!globalThis.chrome) {
    throw new Error("Chrome extension APIs are unavailable in this context.");
  }

  return globalThis.chrome;
}

async function sendRuntimeMessage<TPayload>(
  message: { action: string; payload: unknown },
): Promise<TPayload & RuntimeErrorResponse> {
  const chromeApi = getChromeApi();

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(message, (response) => {
      if (chromeApi.runtime.lastError) {
        resolve({
          error: {
            errorCode: "BACKGROUND_ERROR",
            errorMessage: chromeApi.runtime.lastError.message,
          },
        } as TPayload & RuntimeErrorResponse);
        return;
      }

      resolve((response ?? {}) as TPayload & RuntimeErrorResponse);
    });
  });
}

async function sendTabMessage<TPayload>(
  tabId: number,
  message: { action: string },
): Promise<TPayload | undefined> {
  const chromeApi = getChromeApi();

  return new Promise((resolve) => {
    chromeApi.tabs.sendMessage(tabId, message, (response) => {
      if (chromeApi.runtime.lastError) {
        resolve(undefined);
        return;
      }

      resolve(response as TPayload | undefined);
    });
  });
}

function readInjectedSidebarHostContext(): Partial<PopupTabContext> {
  const locationHref = globalThis.location?.href;
  if (!locationHref) {
    return {};
  }

  try {
    const parsed = new URL(locationHref);
    const hostUrl = parsed.searchParams.get("hostUrl");
    const hostOrigin = parsed.searchParams.get("hostOrigin");
    const hostPageType = parsed.searchParams.get("hostPageType");
    const larkUserId = parsed.searchParams.get("larkUserId");
    const meegleUserKey = parsed.searchParams.get("meegleUserKey");

    if (!hostUrl && !hostOrigin && !hostPageType && !larkUserId && !meegleUserKey) {
      return {};
    }

    let pageType: PopupPageType = "unsupported";
    if (
      hostPageType === "lark"
      || hostPageType === "meegle"
      || hostPageType === "github"
      || hostPageType === "unsupported"
    ) {
      pageType = hostPageType;
    } else if (hostUrl) {
      pageType = detectPopupPageType(hostUrl);
    }

    return {
      url: hostUrl ?? null,
      origin: hostOrigin ?? null,
      pageType,
      larkUserId: larkUserId || undefined,
      meegleUserKey: meegleUserKey || undefined,
    };
  } catch {
    return {};
  }
}

export async function queryActiveTabContext(): Promise<PopupTabContext> {
  const injectedContext = readInjectedSidebarHostContext();
  const response = await sendRuntimeMessage<{
    payload?: { id: number | null; url: string | null };
  }>({
    action: "itdog.query_active_tab_context",
    payload: {},
  });

  if (response.error || !response.payload) {
    if (injectedContext.url || injectedContext.origin || injectedContext.larkUserId || injectedContext.meegleUserKey) {
      return {
        id: null,
        url: injectedContext.url ?? null,
        origin: injectedContext.origin ?? null,
        pageType: injectedContext.pageType ?? "unsupported",
        larkUserId: injectedContext.larkUserId,
        meegleUserKey: injectedContext.meegleUserKey,
      };
    }

    return {
      id: null,
      url: null,
      origin: null,
      pageType: "unsupported",
    };
  }

  const { id: tabId, url } = response.payload;

  if (!url) {
    return {
      id: tabId ?? null,
      url: null,
      origin: null,
      pageType: "unsupported",
    };
  }

  try {
    const parsed = new URL(url);

    return {
      id: tabId ?? null,
      url: injectedContext.url ?? url,
      origin: injectedContext.origin ?? parsed.origin,
      pageType: injectedContext.pageType ?? detectPopupPageType(injectedContext.url ?? url),
      larkUserId: injectedContext.larkUserId,
      meegleUserKey: injectedContext.meegleUserKey,
    };
  } catch {
    return {
      id: tabId ?? null,
      url: injectedContext.url ?? url,
      origin: injectedContext.origin ?? null,
      pageType: injectedContext.pageType ?? "unsupported",
      larkUserId: injectedContext.larkUserId,
      meegleUserKey: injectedContext.meegleUserKey,
    };
  }
}

export async function requestLarkUserId(
  tabId: number,
): Promise<string | undefined> {
  runtimeLogger.debug("requestLarkUserId.start", { tabId });
  const response = await sendTabMessage<{ userId?: string }>(tabId, {
    action: "getLarkUserId",
  });

  runtimeLogger.debug("requestLarkUserId.done", {
    tabId,
    hasUserId: Boolean(response?.userId),
    userId: summarizeIdentifier(response?.userId),
  });

  return response?.userId;
}

export async function requestMeegleUserIdentity(
  tabId: number,
  pageUrl?: string,
): Promise<{ userKey?: string; tenantKey?: string } | undefined> {
  runtimeLogger.debug("requestMeegleUserIdentity.start", {
    tabId,
    hasPageUrl: Boolean(pageUrl),
    pageUrl,
  });
  const pageIdentity = await sendTabMessage<{ userKey?: string; tenantKey?: string }>(tabId, {
    action: "getMeegleUserIdentity",
  });

  runtimeLogger.debug("requestMeegleUserIdentity.page_result", {
    tabId,
    hasUserKey: Boolean(pageIdentity?.userKey),
    userKey: summarizeIdentifier(pageIdentity?.userKey),
    tenantKey: summarizeIdentifier(pageIdentity?.tenantKey),
  });

  if (pageIdentity?.userKey) {
    runtimeLogger.debug("requestMeegleUserIdentity.done", {
      tabId,
      source: "page",
      hasUserKey: true,
      userKey: summarizeIdentifier(pageIdentity.userKey),
      tenantKey: summarizeIdentifier(pageIdentity.tenantKey),
    });
    return pageIdentity;
  }

  if (!pageUrl) {
    runtimeLogger.debug("requestMeegleUserIdentity.done", {
      tabId,
      source: "page",
      hasUserKey: Boolean(pageIdentity?.userKey),
    });
    return pageIdentity;
  }

  runtimeLogger.debug("requestMeegleUserIdentity.cookie_fallback.start", {
    tabId,
    pageUrl,
  });
  const cookieIdentity = await sendRuntimeMessage<{
    payload?: { userKey?: string; tenantKey?: string };
  }>({
    action: "itdog.meegle.identity.cookies",
    payload: {
      pageUrl,
    },
  });

  runtimeLogger.debug("requestMeegleUserIdentity.done", {
    tabId,
    source: cookieIdentity.payload?.userKey ? "cookie" : "unresolved",
    hasUserKey: Boolean(cookieIdentity.payload?.userKey ?? pageIdentity?.userKey),
    userKey: summarizeIdentifier(cookieIdentity.payload?.userKey ?? pageIdentity?.userKey),
    tenantKey: summarizeIdentifier(cookieIdentity.payload?.tenantKey ?? pageIdentity?.tenantKey),
  });

  return cookieIdentity.payload ?? pageIdentity;
}

export async function runMeegleAuthRequest(
  request: MeegleAuthEnsureRequest,
): Promise<MeegleAuthEnsureResponse> {
  runtimeLogger.debug("runMeegleAuthRequest.start", {
    requestId: request.requestId,
    masterUserId: summarizeIdentifier(request.masterUserId),
    meegleUserKey: summarizeIdentifier(request.meegleUserKey),
    baseUrl: request.baseUrl,
    currentPageIsMeegle: request.currentPageIsMeegle,
    currentTabId: request.currentTabId,
  });
  const response = await sendRuntimeMessage<{
    payload?: MeegleAuthEnsureResponse;
  }>({
    action: "itdog.meegle.auth.ensure",
    payload: request,
  });

  if (response.payload) {
    runtimeLogger.debug("runMeegleAuthRequest.done", {
      requestId: request.requestId,
      status: response.payload.status,
      reason: response.payload.reason,
      credentialStatus: response.payload.credentialStatus,
      baseUrl: response.payload.baseUrl,
    });
    return response.payload;
  }

  runtimeLogger.warn("runMeegleAuthRequest.empty_response", {
    requestId: request.requestId,
    baseUrl: request.baseUrl,
    errorCode: response.error?.errorCode,
    errorMessage: response.error?.errorMessage,
  });
  return {
    status: "failed",
    baseUrl: request.baseUrl,
    reason: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
    errorMessage:
      response.error?.errorMessage || "Background returned an empty response.",
  };
}

export async function runMeegleLarkPushRequest(
  request: MeegleLarkPushRequest,
): Promise<MeegleLarkPushResponse> {
  const config = await getConfig();
  console.debug("[runMeegleLarkPushRequest] request:", request);
  try {
    const { payload: result } = await fetchServerJson<MeegleLarkPushResponse>({
      url: `${config.SERVER_URL}/api/meegle/workitem/update-lark-and-push`,
      masterUserId: request.masterUserId,
      body: request,
    });

    console.debug("[runMeegleLarkPushRequest] response:", result);
    return result;
  } catch (error) {
    console.debug("[runMeegleLarkPushRequest] error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function resolveIdentityRequest(input: {
  masterUserId?: string;
  operatorLarkId?: string;
  meegleUserKey?: string;
  pageContext: {
    platform: "lark" | "meegle" | "github" | "unknown";
    baseUrl: string;
    pathname: string;
  };
}): Promise<IdentityResolveResponse> {
  const config = await getConfig();
  runtimeLogger.debug("resolveIdentityRequest.start", {
    platform: input.pageContext.platform,
    baseUrl: input.pageContext.baseUrl,
    pathname: input.pageContext.pathname,
    hasMasterUserId: Boolean(input.masterUserId),
    hasOperatorLarkId: Boolean(input.operatorLarkId),
    hasMeegleUserKey: Boolean(input.meegleUserKey),
    masterUserId: summarizeIdentifier(input.masterUserId),
    operatorLarkId: summarizeIdentifier(input.operatorLarkId),
    meegleUserKey: summarizeIdentifier(input.meegleUserKey),
  });
  const { payload } = await fetchServerJson<IdentityResolveResponse>({
    url: `${config.SERVER_URL}/api/identity/resolve`,
    masterUserId: input.masterUserId,
    body: {
      requestId: `req_${Date.now()}`,
      masterUserId: input.masterUserId,
      operatorLarkId: input.operatorLarkId,
      meegleUserKey: input.meegleUserKey,
      pageContext: input.pageContext,
    },
  });
  runtimeLogger.debug("resolveIdentityRequest.done", {
    ok: payload.ok,
    hasMasterUserId: Boolean(payload.data?.masterUserId),
    masterUserId: summarizeIdentifier(payload.data?.masterUserId),
    identityStatus: payload.data?.identityStatus,
    operatorLarkId: summarizeIdentifier(payload.data?.operatorLarkId),
    meegleUserKey: summarizeIdentifier(payload.data?.meegleUserKey),
    errorCode: payload.error?.errorCode,
    errorMessage: payload.error?.errorMessage,
  });
  return payload;
}

export async function listKimiChatSessions(
  input: {
    masterUserId: string;
    operatorLarkId: string;
  },
): Promise<KimiChatSessionListResponse> {
  const config = await getConfig();
  const { payload } = await fetchServerJson<KimiChatSessionListResponse>({
    url: `${config.SERVER_URL}/api/acp/kimi/sessions/list`,
    masterUserId: input.masterUserId,
    body: input,
  });

  return payload;
}

export async function loadKimiChatSession(
  input: {
    masterUserId: string;
    operatorLarkId: string;
    sessionId: string;
  },
): Promise<KimiChatSessionLoadResponse> {
  const config = await getConfig();
  const { payload } = await fetchServerJson<KimiChatSessionLoadResponse>({
    url: `${config.SERVER_URL}/api/acp/kimi/sessions/load`,
    masterUserId: input.masterUserId,
    body: input,
  });

  return payload;
}

export async function deleteKimiChatSession(
  input: {
    masterUserId: string;
    operatorLarkId: string;
    sessionId: string;
  },
): Promise<{ ok: boolean; error?: { errorCode?: string; errorMessage?: string } }> {
  const config = await getConfig();
  const { payload } = await fetchServerJson<{
    ok: boolean;
    error?: { errorCode?: string; errorMessage?: string };
  }>({
    url: `${config.SERVER_URL}/api/acp/kimi/sessions/delete`,
    masterUserId: input.masterUserId,
    body: input,
  });

  return payload;
}

export async function renameKimiChatSession(
  input: {
    masterUserId: string;
    operatorLarkId: string;
    sessionId: string;
    title: string;
  },
): Promise<{ ok: boolean; data?: { sessionId: string; title: string | null }; error?: { errorCode?: string; errorMessage?: string } }> {
  const config = await getConfig();
  const { payload } = await fetchServerJson<{
    ok: boolean;
    data?: { sessionId: string; title: string | null };
    error?: { errorCode?: string; errorMessage?: string };
  }>({
    url: `${config.SERVER_URL}/api/acp/kimi/sessions/rename`,
    masterUserId: input.masterUserId,
    body: input,
  });

  return payload;
}

export async function loadKimiChatTranscriptSnapshot(input: {
  operatorLarkId: string;
  sessionId: string;
}): Promise<KimiChatTranscriptSnapshot | undefined> {
  return await getStoredKimiChatTranscriptSnapshot(input);
}

export async function saveKimiChatTranscriptSnapshot(
  snapshot: KimiChatTranscriptSnapshot,
): Promise<void> {
  await persistKimiChatTranscriptSnapshot(snapshot);
}

export async function deleteKimiChatTranscriptSnapshot(input: {
  operatorLarkId: string;
  sessionId: string;
}): Promise<void> {
  await deleteStoredKimiChatTranscriptSnapshot(input);
}

export async function runLarkAuthRequest(
  input: {
    masterUserId?: string;
    baseUrl: string;
    force?: boolean;
  },
): Promise<LarkAuthEnsureResponse> {
  runtimeLogger.debug("runLarkAuthRequest.start", {
    masterUserId: summarizeIdentifier(input.masterUserId),
    baseUrl: input.baseUrl,
    force: input.force ?? false,
  });
  const response = await sendRuntimeMessage<{
    payload?: LarkAuthEnsureResponse;
  }>({
    action: "itdog.lark.auth.ensure",
    payload: {
      requestId: `req_${Date.now()}`,
      masterUserId: input.masterUserId,
      baseUrl: input.baseUrl,
      force: input.force,
    },
  });

  if (response.payload) {
    runtimeLogger.debug("runLarkAuthRequest.done", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      status: response.payload.status,
      reason: response.payload.reason,
      credentialStatus: response.payload.credentialStatus,
      expiresAt: response.payload.expiresAt,
      baseUrl: response.payload.baseUrl,
    });
    return response.payload;
  }

  runtimeLogger.warn("runLarkAuthRequest.empty_response", {
    masterUserId: summarizeIdentifier(input.masterUserId),
    baseUrl: input.baseUrl,
    errorCode: response.error?.errorCode,
    errorMessage: response.error?.errorMessage,
  });
  return {
    status: "failed",
    baseUrl: input.baseUrl,
    reason: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
    errorMessage: response.error?.errorMessage,
  };
}

export async function runLarkBaseBulkPreviewRequest(
  input: LarkBaseBulkWorkflowRequest,
): Promise<LarkBaseBulkPreviewResultPayload> {
  const response = await sendRuntimeMessage<{
    payload?: LarkBaseBulkPreviewResultPayload;
  }>({
    action: "itdog.lark_base.bulk_preview_workitems",
    payload: input,
  });

  if (response.payload) {
    return response.payload;
  }

  return {
    ok: false,
    error: {
      errorCode: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
      errorMessage:
        response.error?.errorMessage || "Background returned an empty response.",
    },
  };
}

export async function runLarkBaseBulkCreateRequest(
  input: LarkBaseBulkWorkflowRequest,
): Promise<LarkBaseBulkCreateResultPayload> {
  const response = await sendRuntimeMessage<{
    payload?: LarkBaseBulkCreateResultPayload;
  }>({
    action: "itdog.lark_base.bulk_create_workitems",
    payload: input,
  });

  if (response.payload) {
    return response.payload;
  }

  return {
    ok: false,
    error: {
      errorCode: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
      errorMessage:
        response.error?.errorMessage || "Background returned an empty response.",
    },
  };
}

export async function fetchLarkUserInfo(
  input: {
    masterUserId: string;
    baseUrl: string;
  },
): Promise<
  | {
      ok: true;
      data: {
        userId: string;
        tenantKey: string;
        email?: string;
        name?: string;
        avatarUrl?: string;
      };
    }
  | { ok: false; error?: { errorCode?: string; errorMessage?: string } }
> {
  const config = await getConfig();
  runtimeLogger.debug("fetchLarkUserInfo.start", {
    masterUserId: summarizeIdentifier(input.masterUserId),
    baseUrl: input.baseUrl,
  });

  try {
    const { payload } = await fetchServerJson<
      | {
          ok: true;
          data: {
            userId: string;
            tenantKey: string;
            email?: string;
            name?: string;
            avatarUrl?: string;
          };
        }
      | { ok: false; error?: { errorCode?: string; errorMessage?: string } }
    >({
      url: `${config.SERVER_URL}/api/lark/user-info`,
      masterUserId: input.masterUserId,
      body: {
        masterUserId: input.masterUserId,
        baseUrl: input.baseUrl,
      },
    });
    runtimeLogger.debug("fetchLarkUserInfo.done", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      ok: payload.ok,
      userId: summarizeIdentifier(payload.ok ? payload.data.userId : undefined),
      tenantKey: summarizeIdentifier(payload.ok ? payload.data.tenantKey : undefined),
      hasEmail: payload.ok ? Boolean(payload.data.email) : false,
      errorCode: !payload.ok ? payload.error?.errorCode : undefined,
      errorMessage: !payload.ok ? payload.error?.errorMessage : undefined,
    });
    return payload;
  } catch (error) {
    runtimeLogger.error("fetchLarkUserInfo.failed", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      baseUrl: input.baseUrl,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: {
        errorCode: "FETCH_LARK_USER_INFO_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function getLarkAuthStatus(
  input: {
    masterUserId?: string;
    baseUrl: string;
  },
): Promise<LarkAuthEnsureResponse> {
  if (!input.masterUserId) {
    return {
      status: "failed",
      baseUrl: input.baseUrl,
      reason: "LARK_AUTH_REQUIRED_FIELDS_MISSING",
      errorMessage: "masterUserId is required for Lark auth.",
    };
  }

  const config = await getConfig();
  runtimeLogger.debug("getLarkAuthStatus.start", {
    masterUserId: summarizeIdentifier(input.masterUserId),
    baseUrl: input.baseUrl,
  });

  try {
    const { response, payload } = await fetchServerJson<LarkAuthStatusServerResponse>({
      url: `${config.SERVER_URL}/api/lark/auth/status`,
      masterUserId: input.masterUserId,
      body: {
        masterUserId: input.masterUserId,
        baseUrl: input.baseUrl,
      },
    });

    if (!response.ok) {
      runtimeLogger.warn("getLarkAuthStatus.http_failed", {
        masterUserId: summarizeIdentifier(input.masterUserId),
        baseUrl: input.baseUrl,
        statusCode: response.status,
      });
      return {
        status: "failed",
        baseUrl: input.baseUrl,
        masterUserId: input.masterUserId,
        reason: "LARK_STATUS_REQUEST_FAILED",
        errorMessage: `Auth status request failed with ${response.status}.`,
      };
    }

    if (!payload.ok || !payload.data) {
      runtimeLogger.warn("getLarkAuthStatus.invalid_payload", {
        masterUserId: summarizeIdentifier(input.masterUserId),
        baseUrl: input.baseUrl,
        errorCode: payload.error?.errorCode,
        errorMessage: payload.error?.errorMessage,
      });
      return {
        status: "failed",
        baseUrl: input.baseUrl,
        masterUserId: input.masterUserId,
        reason: payload.error?.errorCode || "LARK_STATUS_REQUEST_FAILED",
        errorMessage: payload.error?.errorMessage || "Lark auth status response payload is missing.",
      };
    }

    runtimeLogger.debug("getLarkAuthStatus.done", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      status: payload.data.status,
      reason: payload.data.reason,
      credentialStatus: payload.data.credentialStatus,
      expiresAt: payload.data.expiresAt,
      baseUrl: payload.data.baseUrl,
    });
    return {
      status: payload.data.status,
      baseUrl: payload.data.baseUrl,
      masterUserId: payload.data.masterUserId ?? input.masterUserId,
      reason: payload.data.reason,
      credentialStatus: payload.data.credentialStatus,
      expiresAt: payload.data.expiresAt,
    };
  } catch (error) {
    runtimeLogger.error("getLarkAuthStatus.failed", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      baseUrl: input.baseUrl,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "failed",
      baseUrl: input.baseUrl,
      masterUserId: input.masterUserId,
      reason: "LARK_STATUS_REQUEST_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function refreshLarkAuthStatus(
  input: {
    masterUserId?: string;
    baseUrl: string;
  },
): Promise<LarkAuthEnsureResponse> {
  if (!input.masterUserId) {
    return {
      status: "failed",
      baseUrl: input.baseUrl,
      reason: "LARK_AUTH_REQUIRED_FIELDS_MISSING",
      errorMessage: "masterUserId is required for Lark auth.",
    };
  }

  const config = await getConfig();
  runtimeLogger.debug("refreshLarkAuthStatus.start", {
    masterUserId: summarizeIdentifier(input.masterUserId),
    baseUrl: input.baseUrl,
  });

  try {
    const { response, payload } = await fetchServerJson<LarkAuthStatusServerResponse>({
      url: `${config.SERVER_URL}/api/lark/auth/refresh`,
      masterUserId: input.masterUserId,
      body: {
        masterUserId: input.masterUserId,
        baseUrl: input.baseUrl,
      },
    });

    if (!response.ok) {
      runtimeLogger.warn("refreshLarkAuthStatus.http_failed", {
        masterUserId: summarizeIdentifier(input.masterUserId),
        baseUrl: input.baseUrl,
        statusCode: response.status,
      });
      return {
        status: "failed",
        baseUrl: input.baseUrl,
        masterUserId: input.masterUserId,
        reason: "LARK_REFRESH_REQUEST_FAILED",
        errorMessage: `Token refresh request failed with ${response.status}.`,
      };
    }

    if (!payload.ok || !payload.data) {
      runtimeLogger.warn("refreshLarkAuthStatus.invalid_payload", {
        masterUserId: summarizeIdentifier(input.masterUserId),
        baseUrl: input.baseUrl,
        errorCode: payload.error?.errorCode,
        errorMessage: payload.error?.errorMessage,
      });
      return {
        status: "failed",
        baseUrl: input.baseUrl,
        masterUserId: input.masterUserId,
        reason: payload.error?.errorCode || "LARK_REFRESH_REQUEST_FAILED",
        errorMessage: payload.error?.errorMessage || "Lark auth refresh response payload is missing.",
      };
    }

    runtimeLogger.debug("refreshLarkAuthStatus.done", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      status: payload.data.status,
      reason: payload.data.reason,
      credentialStatus: payload.data.credentialStatus,
      expiresAt: payload.data.expiresAt,
      baseUrl: payload.data.baseUrl,
    });

    return {
      status: payload.data.status,
      baseUrl: payload.data.baseUrl,
      masterUserId: payload.data.masterUserId ?? input.masterUserId,
      reason: payload.data.reason,
      credentialStatus: payload.data.credentialStatus,
      expiresAt: payload.data.expiresAt,
    };
  } catch (error) {
    runtimeLogger.error("refreshLarkAuthStatus.failed", {
      masterUserId: summarizeIdentifier(input.masterUserId),
      baseUrl: input.baseUrl,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "failed",
      baseUrl: input.baseUrl,
      masterUserId: input.masterUserId,
      reason: "LARK_REFRESH_REQUEST_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

const AUTH_STORAGE_KEY = "itpm_assistant_auth";

export function watchLarkAuthCallbackResult(
  listener: (result: LarkAuthCallbackResult) => void | Promise<void>,
): () => void {
  const chromeApi = getChromeApi();
  const storageEvents = chromeApi.storage.onChanged;

  if (!storageEvents) {
    return () => {};
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") {
      return;
    }

    const authState = changes[AUTH_STORAGE_KEY]?.newValue as {
      lastLarkAuthResult?: LarkAuthCallbackResult;
    } | undefined;
    const result = authState?.lastLarkAuthResult;

    if (!result?.state || !result.status) {
      return;
    }

    void listener(result);
  };

  storageEvents.addListener(handleChange);
  return () => storageEvents.removeListener(handleChange);
}

export async function loadPopupSettings(): Promise<PopupSettingsForm> {
  const chromeApi = getChromeApi();
  const localSettings = await new Promise<Record<string, string>>((resolve) => {
    chromeApi.storage.local.get(["meegleUserKey", "larkUserId"], (result) => {
      resolve(result as Record<string, string>);
    });
  });
  const config = await getConfig();

  return {
    ENV_NAME: config.ENV_NAME,
    SERVER_URL: config.SERVER_URL || DEFAULT_CONFIG.SERVER_URL,
    MEEGLE_PLUGIN_ID: config.MEEGLE_PLUGIN_ID || "",
    LARK_OAUTH_CALLBACK_URL:
      config.LARK_OAUTH_CALLBACK_URL || DEFAULT_CONFIG.LARK_OAUTH_CALLBACK_URL,
    meegleUserKey: localSettings.meegleUserKey || "",
    larkUserId: localSettings.larkUserId || "",
  };
}

export async function loadResolvedIdentity(): Promise<string | undefined> {
  return getStoredMasterUserId();
}

export async function saveResolvedIdentity(masterUserId: string): Promise<void> {
  await persistResolvedIdentity(masterUserId);
}

export async function clearResolvedIdentity(): Promise<void> {
  await clearStoredResolvedIdentity();
}

export async function loadResolvedIdentityForTab(
  tabId: number,
): Promise<string | undefined> {
  return getStoredResolvedIdentityForTab(tabId);
}

export async function saveResolvedIdentityForTab(
  tabId: number,
  masterUserId: string,
): Promise<void> {
  await persistResolvedIdentityForTab(tabId, masterUserId);
}

export async function clearResolvedIdentityForTab(tabId: number): Promise<void> {
  await clearStoredResolvedIdentityForTab(tabId);
}

export async function savePopupSettings(
  settings: PopupSettingsForm,
): Promise<void> {
  const chromeApi = getChromeApi();

  await new Promise<void>((resolve) => {
    chromeApi.storage.local.set(
      {
        meegleUserKey: settings.meegleUserKey,
        larkUserId: settings.larkUserId,
      },
      () => resolve(),
    );
  });

  const syncData: Record<string, unknown> = {
    ENV_NAME: settings.ENV_NAME || DEFAULT_CONFIG.ENV_NAME,
    MEEGLE_PLUGIN_ID: settings.MEEGLE_PLUGIN_ID,
  };

  if (settings.ENV_NAME === "dev") {
    syncData.SERVER_URL = settings.SERVER_URL;
  }

  await new Promise<void>((resolve) => {
    chromeApi.storage.sync.set(syncData, () => resolve());
  });
}

export { getConfig };
