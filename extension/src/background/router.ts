import type {
  MeegleAuthEnsureMessage,
  MeegleAuthEnsureResult,
  LarkApplyMessage,
  LarkApplyResult,
  LarkAuthCallbackDetectedMessage,
  LarkAuthEnsureMessage,
  LarkAuthEnsureResult,
  LarkDraftMessage,
  LarkDraftResult,
} from "../types/protocol";
import type { EnsureMeegleAuthDeps } from "./handlers/meegle-auth";
import type { EnsureLarkAuthDeps } from "./handlers/lark-auth";
import type { ExtensionConfig } from "./config.js";
import { getMeegleIdentityFromCookies } from "./handlers/meegle-identity.js";
import { ensureMeegleAuth } from "./handlers/meegle-auth.js";
import { ensureLarkAuth, handleLarkAuthCallbackDetected } from "./handlers/lark-auth.js";
import {
  getCachedUserToken,
  saveAuthCodeResponse,
  getCachedLarkUserToken,
  clearPendingLarkOauthState,
  saveLastLarkAuthResult,
  savePendingLarkOauthState,
} from "./storage.js";
import { getConfig } from "./config.js";

// Cache for user token (populated asynchronously)
let cachedToken: string | undefined;
let tokenCheckPending = false;

// Cache for Lark token
let cachedLarkToken: string | undefined;
let larkTokenCheckPending = false;

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
      errorMessage?: string;
    };
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.errorMessage ?? `Request failed with ${response.status}`);
  }

  return payload;
}

function buildApplyRequestBody(message: LarkApplyMessage["payload"]) {
  if (!message.operatorLarkId) {
    throw new Error("operatorLarkId is required to apply a draft.");
  }

  const now = Date.now();

  return {
    requestId: `req_${now}`,
    draftId: message.draft.draftId,
    operatorLarkId: message.operatorLarkId,
    sourceRecordId: message.draft.sourceRef.sourceRecordId || message.recordId,
    idempotencyKey: `idem_${message.recordId ?? message.draft.draftId}_${now}`,
    confirmedDraft: {
      name: message.draft.name,
      fieldValuePairs: message.draft.fieldValuePairs,
      ownerUserKeys: message.draft.ownerUserKeys,
    },
  };
}

export async function routeBackgroundAction(
  message:
    | MeegleAuthEnsureMessage
    | LarkAuthEnsureMessage
    | LarkAuthCallbackDetectedMessage
    | LarkDraftMessage
    | LarkApplyMessage,
): Promise<MeegleAuthEnsureResult | LarkAuthEnsureResult | LarkDraftResult | LarkApplyResult | { ok: true }> {
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

  if (message.action === "itdog.a1.create_b2_draft") {
    return {
      action: message.action,
      payload: await postServerJson(config, "/api/a1/create-b2-draft", {
        recordId: message.payload.recordId,
      }),
    };
  }

  if (message.action === "itdog.a2.create_b1_draft") {
    return {
      action: message.action,
      payload: await postServerJson(config, "/api/a2/create-b1-draft", {
        recordId: message.payload.recordId,
      }),
    };
  }

  if (message.action === "itdog.a1.apply_b2") {
    return {
      action: message.action,
      payload: await postServerJson(config, "/api/a1/apply-b2", buildApplyRequestBody(message.payload)),
    };
  }

  if (message.action === "itdog.a2.apply_b1") {
    return {
      action: message.action,
      payload: await postServerJson(config, "/api/a2/apply-b1", buildApplyRequestBody(message.payload)),
    };
  }

  throw new Error(`Unknown action: ${(message as any).action}`);
}

/**
 * Handle extension messages
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    message.action === "itdog.a1.create_b2_draft" ||
    message.action === "itdog.a1.apply_b2" ||
    message.action === "itdog.a2.create_b1_draft" ||
    message.action === "itdog.a2.apply_b1"
  ) {
    routeBackgroundAction(
      message as MeegleAuthEnsureMessage | LarkAuthEnsureMessage | LarkAuthCallbackDetectedMessage | LarkDraftMessage | LarkApplyMessage,
    )
      .then((result) => {
        sendResponse(result);
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

    return true; // Keep channel open for async response
  }

  return false; // Not handled
});

console.log("[Tenways Octo] Background router initialized");
