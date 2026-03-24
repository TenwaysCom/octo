import type {
  MeegleAuthEnsureMessage,
  MeegleAuthEnsureResult,
  LarkAuthEnsureMessage,
  LarkAuthEnsureResult,
} from "../types/protocol";
import type { EnsureMeegleAuthDeps } from "./handlers/meegle-auth";
import type { EnsureLarkAuthDeps } from "./handlers/lark-auth";
import { ensureMeegleAuth } from "./handlers/meegle-auth.js";
import { ensureLarkAuth } from "./handlers/lark-auth.js";
import type { LarkAuthCodeResponse } from "../types/lark";
import {
  getCachedUserToken,
  getCachedPluginId,
  saveAuthCodeResponse,
  getCachedLarkUserToken,
  saveLarkUserToken,
} from "./storage.js";

const PLUGIN_ID = "your-plugin-id"; // TODO: Configure via environment or settings

/**
 * Build deps for ensureMeegleAuth
 */
function buildAuthDeps(): EnsureMeegleAuthDeps {
  return {
    getCachedToken: () => {
      // Note: This is synchronous, but getCachedUserToken is async
      // We'll read from a cached value instead
      return undefined; // Placeholder - will be populated via async init
    },
    getCachedPluginId: () => PLUGIN_ID,
    saveAuthCode: async (response) => {
      await saveAuthCodeResponse(
        response.authCode,
        response.state,
        response.issuedAt,
      );
    },
  };
}

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

export async function routeBackgroundAction(
  message: MeegleAuthEnsureMessage | LarkAuthEnsureMessage,
): Promise<MeegleAuthEnsureResult | LarkAuthEnsureResult> {
  if (message.action === "itdog.meegle.auth.ensure") {
    const deps: EnsureMeegleAuthDeps = {
      getCachedToken: () => cachedToken,
      getCachedPluginId: () => PLUGIN_ID,
      saveAuthCode: async (response) => {
        await saveAuthCodeResponse(
          response.authCode,
          response.state,
          response.issuedAt,
        );
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
      saveLarkAuthCode: async (response: LarkAuthCodeResponse) => {
        // Save Lark auth code if needed
        console.log("[IT PM Assistant] Lark auth code response:", response);
      },
    };

    return {
      action: message.action,
      payload: await ensureLarkAuth(message.payload, deps),
    };
  }

  throw new Error(`Unknown action: ${(message as any).action}`);
}

/**
 * Handle extension messages
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "itdog.meegle.auth.ensure" || message.action === "itdog.lark.auth.ensure") {
    routeBackgroundAction(message as MeegleAuthEnsureMessage | LarkAuthEnsureMessage)
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

console.log("[IT PM Assistant] Background router initialized");
