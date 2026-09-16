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
  WebPluginLoginApprovalMessage,
  WebPluginLoginApprovalResult,
  GitHubPrOdooDevopsBuildMessage,
  GitHubPrOdooDevopsBuildResult,
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
import {
  getConfig,
  isLarkOAuthCallbackCompatibleWithServer,
} from "./config.js";
import { isConfiguredOctoWebOriginAllowed } from "../web-origin-config.js";
import { normalizeLarkAuthBaseUrl } from "../platform-url.js";
import { createExtensionLogger } from "../logger.js";
import {
  checkForUpdate,
  downloadUpdate,
  clearUpdateBadge,
  ignoreCurrentVersion,
} from "./update-checker.js";
import { fetchServerJson } from "../server-request.js";
import { trackAsyncAction } from "./async-action-notifier.js";

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
    | LarkBaseBulkCreateWorkitemsMessage
    | WebPluginLoginApprovalMessage
    | GitHubPrOdooDevopsBuildMessage,
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
  | WebPluginLoginApprovalResult
  | GitHubPrOdooDevopsBuildResult
  | { ok: true }
> {
  const config = await getConfig();

  if (message.action === "octo.web.plugin-login.approve") {
    if (!isConfiguredOctoWebOriginAllowed({
      pageOrigin: message.payload.pageOrigin,
      serverUrl: config.SERVER_URL,
    })) {
      return {
        action: message.action,
        payload: { status: "failed", errorCode: "ENVIRONMENT_MISMATCH" },
      };
    }

    const masterUserId = await getStoredMasterUserId();
    if (!masterUserId) {
      return {
        action: message.action,
        payload: { status: "failed", errorCode: "PLUGIN_IDENTITY_REQUIRED" },
      };
    }

    try {
      await postServerJson(config, "/api/web/plugin-login/approve", {
        challengeId: message.payload.challengeId,
        masterUserId,
      });
      return { action: message.action, payload: { status: "approved" } };
    } catch (error) {
      const errorCode = error instanceof BackgroundActionError ? error.errorCode : "PLUGIN_LOGIN_FAILED";
      return {
        action: message.action,
        payload: {
          status: "failed",
          errorCode,
        },
      };
    }
  }

  if (message.action === "octo.github-pr.odoo-devops-build.read") {
    const url = new URL(`${config.SERVER_URL}/api/web/github-pr-odoo-devops-build`);
    url.searchParams.set("owner", message.payload.owner);
    url.searchParams.set("repo", message.payload.repo);
    url.searchParams.set("pullNumber", String(message.payload.pullNumber));
    try {
      const { response, payload } = await fetchServerJson<{
        ok: boolean;
        data?: GitHubPrOdooDevopsBuildResult["payload"]["data"];
        error?: { errorCode?: string };
      }>({
        url: url.toString(),
        method: "GET",
        credentials: "include",
      });
      if (!response.ok || !payload.ok || !payload.data) {
        return {
          action: message.action,
          payload: { status: "unavailable", errorCode: payload.error?.errorCode ?? "GITHUB_PR_BUILD_UNAVAILABLE" },
        };
      }
      return { action: message.action, payload: { status: "ready", data: payload.data } };
    } catch (error) {
      routerLogger.warn("github_pr_odoo_devops_build.read_failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { action: message.action, payload: { status: "unavailable", errorCode: "GITHUB_PR_BUILD_UNAVAILABLE" } };
    }
  }

  if (message.action === "octo.meegle.auth.ensure") {
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

  if (message.action === "octo.lark.auth.ensure") {
    const hasRequiredLarkOauthConfig = Boolean(
      config.LARK_APP_ID && config.LARK_OAUTH_CALLBACK_URL,
    );
    const callbackMatchesServer = hasRequiredLarkOauthConfig
      && isLarkOAuthCallbackCompatibleWithServer({
        serverUrl: config.SERVER_URL,
        callbackUrl: config.LARK_OAUTH_CALLBACK_URL,
      });
    if (!callbackMatchesServer) {
      const reason = hasRequiredLarkOauthConfig
        ? "LARK_OAUTH_CONFIG_ENVIRONMENT_MISMATCH"
        : "LARK_PUBLIC_CONFIG_UNAVAILABLE";
      routerLogger.warn("Lark OAuth blocked by invalid environment config", {
        environmentName: config.ENV_NAME,
        serverUrl: config.SERVER_URL,
        reason,
      });
      return {
        action: message.action,
        payload: {
          status: "failed",
          baseUrl: normalizeLarkAuthBaseUrl(
            message.payload.baseUrl ?? message.payload.pageOrigin,
          ),
          masterUserId: message.payload.masterUserId,
          reason,
          errorMessage: hasRequiredLarkOauthConfig
            ? "Lark OAuth callback does not match the selected Octo environment. Save and refresh the environment configuration before retrying."
            : "Lark OAuth public configuration is unavailable. Refresh the selected Octo environment before retrying.",
        },
      };
    }

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

  if (message.action === "octo.lark.auth.callback.detected") {
    await handleLarkAuthCallbackDetected(message.payload, {
      saveLastLarkAuthResult,
      clearPendingLarkOauthState,
    });
    return { ok: true };
  }

  if (message.action === "octo.lark_base.create_workitem") {
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
        actionRunId: message.payload.actionRunId,
      }),
    };
  }

  if (message.action === "octo.lark_base.bulk_preview_workitems") {
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
          actionRunId: message.payload.actionRunId,
        },
      ),
    };
  }

  if (message.action === "octo.lark_base.bulk_create_workitems") {
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
          actionRunId: message.payload.actionRunId,
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
  if (message.action === "octo.query_active_tab_context") {
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

  if (message.action === "octo.meegle.identity.cookies") {
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

  if (message.action === "octo.async-action.track") {
    trackAsyncAction(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        routerLogger.error("Async action tracking failed", { errorMessage });
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

  if (
    message.action === "octo.meegle.auth.ensure" ||
    message.action === "octo.lark.auth.ensure" ||
    message.action === "octo.lark.auth.callback.detected" ||
    message.action === "octo.web.plugin-login.approve" ||
    message.action === "octo.github-pr.odoo-devops-build.read" ||
    message.action === "octo.lark_base.create_workitem" ||
    message.action === "octo.lark_base.bulk_preview_workitems" ||
    message.action === "octo.lark_base.bulk_create_workitems"
  ) {
    routeBackgroundAction(
      message as
        | MeegleAuthEnsureMessage
        | LarkAuthEnsureMessage
        | LarkAuthCallbackDetectedMessage
        | LarkBaseCreateWorkitemMessage
        | LarkBaseBulkPreviewWorkitemsMessage
        | LarkBaseBulkCreateWorkitemsMessage
        | WebPluginLoginApprovalMessage
        | GitHubPrOdooDevopsBuildMessage,
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

  if (message.action === "octo.update.check") {
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

  if (message.action === "octo.update.download") {
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

  if (message.action === "octo.update.ignore") {
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

  if (message.action === "octo.update.clearBadge") {
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
