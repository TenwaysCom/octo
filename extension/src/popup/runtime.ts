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
  const syncSettings = await new Promise<Record<string, string>>((resolve) => {
    chromeApi.storage.sync.get(
      {
        SERVER_URL: DEFAULT_CONFIG.SERVER_URL,
        MEEGLE_PLUGIN_ID: "",
      },
      (result) => {
        resolve(result as Record<string, string>);
      },
    );
  });

  return {
    SERVER_URL: syncSettings.SERVER_URL || DEFAULT_CONFIG.SERVER_URL,
    MEEGLE_PLUGIN_ID: syncSettings.MEEGLE_PLUGIN_ID || "",
    meegleUserKey: localSettings.meegleUserKey || "",
    larkUserId: localSettings.larkUserId || "",
  };
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
