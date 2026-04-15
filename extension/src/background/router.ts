import type {
  MeegleAuthEnsureMessage,
  MeegleAuthEnsureResult,
  LarkAuthCallbackDetectedMessage,
  LarkAuthEnsureMessage,
  LarkAuthEnsureResult,
  LarkBaseCreateWorkitemMessage,
  LarkBaseCreateWorkitemResult,
} from "../types/protocol";
import type { EnsureMeegleAuthDeps } from "./handlers/meegle-auth";
import type { EnsureLarkAuthDeps } from "./handlers/lark-auth";
import type { ExtensionConfig } from "./config.js";
import { getMeegleIdentityFromCookies } from "./handlers/meegle-identity.js";
import { ensureMeegleAuth } from "./handlers/meegle-auth.js";
import { ensureLarkAuth, handleLarkAuthCallbackDetected } from "./handlers/lark-auth.js";
import {
  getResolvedIdentityForTab,
  getCachedUserToken,
  saveAuthCodeResponse,
  getCachedLarkUserToken,
  clearPendingLarkOauthState,
  saveLastLarkAuthResult,
  savePendingLarkOauthState,
  getStoredMasterUserId,
} from "./storage.js";
import { getConfig } from "./config.js";

// Cache for user token (populated asynchronously)
let cachedToken: string | undefined;
let tokenCheckPending = false;

// Cache for Lark token
let cachedLarkToken: string | undefined;
let larkTokenCheckPending = false;

class BackgroundActionError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
  ) {
    super(message);
    this.name = "BackgroundActionError";
    Object.setPrototypeOf(this, BackgroundActionError.prototype);
  }
}

/**
 * Initialize token cache
 */
async function initTokenCache(): Promise<void> {
  if (tokenCheckPending) return;
  tokenCheckPending = true;
  cachedToken = await getCachedUserToken();
  tokenCheckPending = false;

  if (larkTokenCheckPending) return;
  larkTokenCheckPending = true;
  cachedLarkToken = await getCachedLarkUserToken();
  larkTokenCheckPending = false;
}

// Initialize on load
initTokenCache();

function extractLarkBaseContextFromUrl(url: string | undefined): { baseId?: string; tableId?: string } {
  if (!url) {
    return {};
  }

  try {
    const parsed = new URL(url);
    const routeCandidates = [parsed.pathname, decodeURIComponent(parsed.hash.replace(/^#/, ""))];

    let baseId: string | undefined;
    let tableId: string | undefined;

    for (const candidate of routeCandidates) {
      const match = candidate.match(/\/base\/([^/?#]+)(?:\/table\/([^/?#]+))?/);
      if (match) {
        baseId = match[1];
        tableId = match[2];
        break;
      }
    }

    const hashQueryIndex = decodeURIComponent(parsed.hash.replace(/^#/, "")).indexOf("?");
    const searchParams = [
      parsed.searchParams,
      new URLSearchParams(hashQueryIndex >= 0 ? decodeURIComponent(parsed.hash.replace(/^#/, "")).slice(hashQueryIndex + 1) : ""),
    ];

    for (const params of searchParams) {
      baseId = baseId || params.get("baseId") || params.get("appId") || params.get("app") || params.get("base") || undefined;
      tableId = tableId || params.get("tableId") || params.get("table") || params.get("tbl") || undefined;
    }

    if (baseId && tableId) {
      return { baseId, tableId };
    }
  } catch {
    // ignore invalid URL
  }

  return {};
}

async function postServerJson<TResponse>(
  config: ExtensionConfig,
  path: string,
  body: unknown,
): Promise<TResponse> {
  const response = await fetch(`${config.SERVER_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as TResponse & {
    ok?: boolean;
    error?: {
      errorCode?: string;
      errorMessage?: string;
    };
  };

  if (!response.ok || payload.ok === false) {
    throw new BackgroundActionError(
      payload.error?.errorMessage ?? `Request failed with ${response.status}`,
      payload.error?.errorCode ?? "BACKGROUND_ERROR",
    );
  }

  return payload;
}

export async function routeBackgroundAction(
  message:
    | MeegleAuthEnsureMessage
    | LarkAuthEnsureMessage
    | LarkAuthCallbackDetectedMessage
    | LarkBaseCreateWorkitemMessage,
  context: {
    senderTabId?: number;
    tabUrl?: string;
  } = {},
): Promise<MeegleAuthEnsureResult | LarkAuthEnsureResult | LarkBaseCreateWorkitemResult | { ok: true }> {
  const config = await getConfig();

  if (message.action === "itdog.meegle.auth.ensure") {
    const deps: EnsureMeegleAuthDeps = {
      getCachedToken: () => cachedToken,
      getCachedPluginId: () => config.MEEGLE_PLUGIN_ID,
      saveAuthCode: async (response) => {
        await saveAuthCodeResponse(
          response.authCode,
          response.state,
          response.issuedAt,
        );
      },
      // Disable auto-redirect to Meegle login page
      openMeegleLoginTab: async () => {
        console.log("[Tenways Octo] Auto-redirect disabled. User needs to login manually.");
      },
    };

    return {
      action: message.action,
      payload: await ensureMeegleAuth(message.payload, deps),
    };
  }

  if (message.action === "itdog.lark.auth.ensure") {
    const deps: EnsureLarkAuthDeps = {
      getCachedLarkToken: () => cachedLarkToken,
      savePendingLarkOauthState,
      appId: config.LARK_APP_ID,
      callbackUrl: config.LARK_OAUTH_CALLBACK_URL,
    };

    return {
      action: message.action,
      payload: await ensureLarkAuth(message.payload, deps),
    };
  }

  if (message.action === "itdog.lark.auth.callback.detected") {
    await handleLarkAuthCallbackDetected(message.payload, {
      saveLastLarkAuthResult,
      clearPendingLarkOauthState,
    });
    return { ok: true };
  }

  if (message.action === "itdog.lark_base.create_workitem") {
    const masterUserId =
      message.payload.masterUserId
      ?? (context.senderTabId != null
        ? await getResolvedIdentityForTab(context.senderTabId)
        : undefined)
      ?? await getStoredMasterUserId();
    const tabUrlContext = extractLarkBaseContextFromUrl(context.tabUrl);
    return {
      action: message.action,
      payload: await postServerJson(config, "/api/lark-base/create-meegle-workitem", {
        recordId: message.payload.recordId,
        masterUserId,
        baseId: message.payload.baseId ?? tabUrlContext.baseId,
        tableId: message.payload.tableId ?? tabUrlContext.tableId,
      }),
    };
  }

  throw new Error(`Unknown action: ${(message as any).action}`);
}

/**
 * Handle extension messages
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "itdog.query_active_tab_context") {
    const tab = sender.tab;
    sendResponse({
      action: message.action,
      payload: {
        id: tab?.id ?? null,
        url: tab?.url ?? null,
      },
    });
    return true;
  }

  if (message.action === "itdog.meegle.identity.cookies") {
    getMeegleIdentityFromCookies(message.payload.pageUrl)
      .then((identity) => {
        sendResponse({
          action: message.action,
          payload: identity,
        });
      })
      .catch((err: Error) => {
        sendResponse({
          ok: false,
          error: {
            errorCode: "BACKGROUND_ERROR",
            errorMessage: err.message,
          },
        });
      });

    return true;
  }

  if (
    message.action === "itdog.meegle.auth.ensure" ||
    message.action === "itdog.lark.auth.ensure" ||
    message.action === "itdog.lark.auth.callback.detected" ||
    message.action === "itdog.lark_base.create_workitem"
  ) {
    routeBackgroundAction(
      message as MeegleAuthEnsureMessage | LarkAuthEnsureMessage | LarkAuthCallbackDetectedMessage | LarkBaseCreateWorkitemMessage,
      {
        senderTabId: sender.tab?.id,
        tabUrl: sender.tab?.url,
      },
    )
      .then((result) => {
        sendResponse(result);
      })
      .catch((err: unknown) => {
        const errorCode =
          err instanceof BackgroundActionError
            ? err.errorCode
            : "BACKGROUND_ERROR";
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendResponse({
          ok: false,
          error: {
            errorCode,
            errorMessage,
          },
        });
      });

    return true; // Keep channel open for async response
  }

  return false; // Not handled
});

console.log("[Tenways Octo] Background router initialized");
