import type {
  MeegleAuthEnsureMessage,
  MeegleAuthEnsureResult,
  LarkAuthCallbackDetectedMessage,
  LarkAuthEnsureMessage,
  LarkAuthEnsureResult,
  LarkBaseCreateWorkitemMessage,
  LarkBaseCreateWorkitemResult,
  LarkBaseBulkPreviewWorkitemsMessage,
  LarkBaseBulkPreviewWorkitemsResult,
  LarkBaseBulkCreateWorkitemsMessage,
  LarkBaseBulkCreateWorkitemsResult,
} from "../types/protocol";
import { extractLarkBaseContextFromUrl } from "../lark-base-url.js";
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
import { createExtensionLogger } from "../logger.js";
import {
  checkForUpdate,
  downloadUpdate,
  clearUpdateBadge,
  ignoreCurrentVersion,
} from "./update-checker.js";
import { fetchServerJson } from "../server-request.js";

const routerLogger = createExtensionLogger("background:router");

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

async function postServerJson<TResponse>(
  config: ExtensionConfig,
  path: string,
  body: unknown,
): Promise<TResponse> {
  const masterUserId =
    body != null
    && typeof body === "object"
    && "masterUserId" in body
    && typeof body.masterUserId === "string"
      ? body.masterUserId
      : undefined;
  const { response, payload } = await fetchServerJson<TResponse & {
    ok?: boolean;
    error?: {
      errorCode?: string;
      errorMessage?: string;
    };
  }>({
    url: `${config.SERVER_URL}${path}`,
    masterUserId,
    body,
  });

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
    | LarkBaseCreateWorkitemMessage
    | LarkBaseBulkPreviewWorkitemsMessage
    | LarkBaseBulkCreateWorkitemsMessage,
  context: {
    senderTabId?: number;
    tabUrl?: string;
  } = {},
): Promise<
  | MeegleAuthEnsureResult
  | LarkAuthEnsureResult
  | LarkBaseCreateWorkitemResult
  | LarkBaseBulkPreviewWorkitemsResult
  | LarkBaseBulkCreateWorkitemsResult
  | { ok: true }
> {
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
        routerLogger.info("Auto-redirect disabled. User needs to login manually.");
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
        wikiRecordId: message.payload.wikiRecordId ?? tabUrlContext.wikiRecordId,
        pageType: message.payload.pageType ?? (tabUrlContext.wikiRecordId ? "lark_wiki_record" : "lark_base"),
      }),
    };
  }

  if (message.action === "itdog.lark_base.bulk_preview_workitems") {
    const masterUserId =
      message.payload.masterUserId
      ?? (context.senderTabId != null
        ? await getResolvedIdentityForTab(context.senderTabId)
        : undefined)
      ?? await getStoredMasterUserId();
    const tabUrlContext = extractLarkBaseContextFromUrl(context.tabUrl);

    return {
      action: message.action,
      payload: await postServerJson(
        config,
        "/api/lark-base/bulk-preview-meegle-workitems",
        {
          masterUserId,
          baseId: message.payload.baseId ?? tabUrlContext.baseId,
          tableId: message.payload.tableId ?? tabUrlContext.tableId,
          viewId: message.payload.viewId ?? tabUrlContext.viewId,
        },
      ),
    };
  }

  if (message.action === "itdog.lark_base.bulk_create_workitems") {
    const masterUserId =
      message.payload.masterUserId
      ?? (context.senderTabId != null
        ? await getResolvedIdentityForTab(context.senderTabId)
        : undefined)
      ?? await getStoredMasterUserId();
    const tabUrlContext = extractLarkBaseContextFromUrl(context.tabUrl);

    return {
      action: message.action,
      payload: await postServerJson(
        config,
        "/api/lark-base/bulk-create-meegle-workitems",
        {
          masterUserId,
          baseId: message.payload.baseId ?? tabUrlContext.baseId,
          tableId: message.payload.tableId ?? tabUrlContext.tableId,
          viewId: message.payload.viewId ?? tabUrlContext.viewId,
        },
      ),
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
    if (tab?.id != null || tab?.url) {
      sendResponse({
        action: message.action,
        payload: {
          id: tab?.id ?? null,
          url: tab?.url ?? null,
        },
      });
      return true;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs?.[0];
      sendResponse({
        action: message.action,
        payload: {
          id: activeTab?.id ?? null,
          url: activeTab?.url ?? null,
        },
      });
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
    message.action === "itdog.lark_base.create_workitem" ||
    message.action === "itdog.lark_base.bulk_preview_workitems" ||
    message.action === "itdog.lark_base.bulk_create_workitems"
  ) {
    routeBackgroundAction(
      message as
        | MeegleAuthEnsureMessage
        | LarkAuthEnsureMessage
        | LarkAuthCallbackDetectedMessage
        | LarkBaseCreateWorkitemMessage
        | LarkBaseBulkPreviewWorkitemsMessage
        | LarkBaseBulkCreateWorkitemsMessage,
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
        routerLogger.error("Background action failed", { action: message.action, errorCode, errorMessage });
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

  if (message.action === "itdog.update.check") {
    getConfig()
      .then((config) => checkForUpdate(config))
      .then((result) => {
        sendResponse(result);
      })
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        routerLogger.error("Update check failed", { errorMessage });
        sendResponse({
          hasUpdate: false,
          currentVersion: chrome.runtime.getManifest().version,
          latestVersion: chrome.runtime.getManifest().version,
          versionInfo: null,
        });
      });
    return true;
  }

  if (message.action === "itdog.update.download") {
    downloadUpdate(message.payload.versionInfo)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        routerLogger.error("Update download failed", { errorMessage });
        sendResponse({
          ok: false,
          error: {
            errorCode: "BACKGROUND_ERROR",
            errorMessage,
          },
        });
      });
    return true;
  }

  if (message.action === "itdog.update.ignore") {
    ignoreCurrentVersion(message.payload.version)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        routerLogger.error("Ignore update failed", { errorMessage });
        sendResponse({
          ok: false,
          error: {
            errorCode: "BACKGROUND_ERROR",
            errorMessage,
          },
        });
      });
    return true;
  }

  if (message.action === "itdog.update.clearBadge") {
    clearUpdateBadge()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        routerLogger.error("Clear update badge failed", { errorMessage });
        sendResponse({
          ok: false,
          error: {
            errorCode: "BACKGROUND_ERROR",
            errorMessage,
          },
        });
      });
    return true;
  }

  return false; // Not handled
});

routerLogger.info("Background router initialized");
