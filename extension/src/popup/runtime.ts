import { DEFAULT_CONFIG, getConfig } from "../background/config.js";
import {
  clearResolvedIdentity as clearStoredResolvedIdentity,
  clearResolvedIdentityForTab as clearStoredResolvedIdentityForTab,
  getStoredMasterUserId,
  getResolvedIdentityForTab as getStoredResolvedIdentityForTab,
  saveResolvedIdentity as persistResolvedIdentity,
  saveResolvedIdentityForTab as persistResolvedIdentityForTab,
} from "../background/storage.js";
import type {
  LarkAuthCallbackResult,
  LarkAuthEnsureResponse,
  LarkAuthStatusServerResponse,
} from "../types/lark.js";
import type {
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "../types/meegle.js";
import type { PopupSettingsForm } from "./types.js";
import { detectPopupPageType, type PopupPageType } from "./view-model.js";

interface RuntimeErrorResponse {
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
  payload?: unknown;
}

export interface PopupTabContext {
  id: number | null;
  url: string | null;
  origin: string | null;
  pageType: PopupPageType;
}

export interface IdentityResolveResponse {
  ok: boolean;
  data?: {
    masterUserId: string;
    identityStatus: "pending_lark_identity" | "active" | "conflict";
    operatorLarkId?: string;
    larkEmail?: string;
    meegleUserKey?: string;
  };
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
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

export async function queryActiveTabContext(): Promise<PopupTabContext> {
  const chromeApi = getChromeApi();
  const [tab] = await chromeApi.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.url) {
    return {
      id: tab?.id ?? null,
      url: null,
      origin: null,
      pageType: "unsupported",
    };
  }

  const url = new URL(tab.url);

  return {
    id: tab.id ?? null,
    url: tab.url,
    origin: url.origin,
    pageType: detectPopupPageType(tab.url),
  };
}

export async function requestLarkUserId(
  tabId: number,
): Promise<string | undefined> {
  const response = await sendTabMessage<{ userId?: string }>(tabId, {
    action: "getLarkUserId",
  });

  return response?.userId;
}

export async function requestMeegleUserIdentity(
  tabId: number,
  pageUrl?: string,
): Promise<{ userKey?: string; tenantKey?: string } | undefined> {
  const pageIdentity = await sendTabMessage<{ userKey?: string; tenantKey?: string }>(tabId, {
    action: "getMeegleUserIdentity",
  });

  if (pageIdentity?.userKey) {
    return pageIdentity;
  }

  if (!pageUrl) {
    return pageIdentity;
  }

  const cookieIdentity = await sendRuntimeMessage<{
    payload?: { userKey?: string; tenantKey?: string };
  }>({
    action: "itdog.meegle.identity.cookies",
    payload: {
      pageUrl,
    },
  });

  return cookieIdentity.payload ?? pageIdentity;
}

export async function runMeegleAuthRequest(
  request: MeegleAuthEnsureRequest,
): Promise<MeegleAuthEnsureResponse> {
  const response = await sendRuntimeMessage<{
    payload?: MeegleAuthEnsureResponse;
  }>({
    action: "itdog.meegle.auth.ensure",
    payload: request,
  });

  if (response.payload) {
    return response.payload;
  }

  return {
    status: "failed",
    baseUrl: request.baseUrl,
    reason: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
    errorMessage:
      response.error?.errorMessage || "Background returned an empty response.",
  };
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
  const response = await fetch(`${config.SERVER_URL}/api/identity/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: `req_${Date.now()}`,
      masterUserId: input.masterUserId,
      operatorLarkId: input.operatorLarkId,
      meegleUserKey: input.meegleUserKey,
      pageContext: input.pageContext,
    }),
  });

  return (await response.json()) as IdentityResolveResponse;
}

export async function runLarkAuthRequest(
  input: {
    masterUserId?: string;
    baseUrl: string;
  },
): Promise<LarkAuthEnsureResponse> {
  const response = await sendRuntimeMessage<{
    payload?: LarkAuthEnsureResponse;
  }>({
    action: "itdog.lark.auth.ensure",
    payload: {
      requestId: `req_${Date.now()}`,
      masterUserId: input.masterUserId,
      baseUrl: input.baseUrl,
    },
  });

  if (response.payload) {
    return response.payload;
  }

  return {
    status: "failed",
    baseUrl: input.baseUrl,
    reason: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
    errorMessage: response.error?.errorMessage,
  };
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

  try {
    const response = await fetch(`${config.SERVER_URL}/api/lark/auth/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        masterUserId: input.masterUserId,
        baseUrl: input.baseUrl,
      }),
    });

    if (!response.ok) {
      return {
        status: "failed",
        baseUrl: input.baseUrl,
        masterUserId: input.masterUserId,
        reason: "LARK_STATUS_REQUEST_FAILED",
        errorMessage: `Auth status request failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as LarkAuthStatusServerResponse;

    if (!payload.ok || !payload.data) {
      return {
        status: "failed",
        baseUrl: input.baseUrl,
        masterUserId: input.masterUserId,
        reason: payload.error?.errorCode || "LARK_STATUS_REQUEST_FAILED",
        errorMessage: payload.error?.errorMessage || "Lark auth status response payload is missing.",
      };
    }

    return {
      status: payload.data.status,
      baseUrl: payload.data.baseUrl,
      masterUserId: payload.data.masterUserId ?? input.masterUserId,
      reason: payload.data.reason,
      credentialStatus: payload.data.credentialStatus,
      expiresAt: payload.data.expiresAt,
    };
  } catch (error) {
    return {
      status: "failed",
      baseUrl: input.baseUrl,
      masterUserId: input.masterUserId,
      reason: "LARK_STATUS_REQUEST_FAILED",
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

  await new Promise<void>((resolve) => {
    chromeApi.storage.sync.set(
      {
        SERVER_URL: settings.SERVER_URL || DEFAULT_CONFIG.SERVER_URL,
        MEEGLE_PLUGIN_ID: settings.MEEGLE_PLUGIN_ID,
      },
      () => resolve(),
    );
  });
}

export { getConfig };
