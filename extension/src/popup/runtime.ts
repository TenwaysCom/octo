import { DEFAULT_CONFIG, getConfig } from "../background/config.js";
import type { LarkAuthEnsureResponse } from "../types/lark.js";
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
): Promise<{ userKey?: string } | undefined> {
  return sendTabMessage<{ userKey?: string }>(tabId, {
    action: "getMeegleUserIdentity",
  });
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
  baseUrl: string,
): Promise<LarkAuthEnsureResponse> {
  const response = await sendRuntimeMessage<{
    payload?: LarkAuthEnsureResponse;
  }>({
    action: "itdog.lark.auth.ensure",
    payload: {
      requestId: `req_${Date.now()}`,
      operatorLarkId: "ou_user",
      baseUrl,
    },
  });

  if (response.payload) {
    return response.payload;
  }

  return {
    status: "failed",
    baseUrl,
    reason: response.error?.errorCode || "BACKGROUND_EMPTY_RESPONSE",
  };
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
    meegleUserKey: localSettings.meegleUserKey || "",
    larkUserId: localSettings.larkUserId || "",
  };
}

export async function loadResolvedIdentity(): Promise<string | undefined> {
  const chromeApi = getChromeApi();

  const localState = await new Promise<Record<string, string>>((resolve) => {
    chromeApi.storage.local.get(["masterUserId"], (result) => {
      resolve(result as Record<string, string>);
    });
  });

  return localState.masterUserId || undefined;
}

export async function saveResolvedIdentity(masterUserId: string): Promise<void> {
  const chromeApi = getChromeApi();

  await new Promise<void>((resolve) => {
    chromeApi.storage.local.set({ masterUserId }, () => resolve());
  });
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
