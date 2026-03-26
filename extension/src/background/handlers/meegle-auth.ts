import type {
  MeegleAuthCodeResponse,
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
  MeegleAuthExchangeResponse,
} from "../../types/meegle";
import { getConfig } from "../config.js";

class MeegleAuthCodeRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MeegleAuthCodeRequestError";
  }
}

export interface EnsureMeegleAuthDeps {
  getCachedToken?: () => string | undefined;
  getCachedPluginId?: () => string | undefined;
  saveAuthCode?: (response: MeegleAuthCodeResponse) => Promise<void>;
  requestAuthCodeFromContentScript?: (
    pluginId: string,
    state: string,
    baseUrl: string,
    tabId?: number,
  ) => Promise<MeegleAuthCodeResponse | undefined>;
  openMeegleLoginTab?: (baseUrl: string) => Promise<void>;
  exchangeAuthCodeWithServer?: (
    request: MeegleAuthEnsureRequest,
    authCode: string,
  ) => Promise<MeegleAuthExchangeResponse | undefined>;
}

function isConfiguredPluginId(pluginId?: string): pluginId is string {
  return Boolean(pluginId && pluginId.trim() && pluginId !== "your-plugin-id");
}

/**
 * Request auth code from Meegle content script
 */
async function requestAuthCodeFromContentScript(
  pluginId: string,
  state: string,
  baseUrl: string,
  tabId?: number,
): Promise<MeegleAuthCodeResponse | undefined> {
  return new Promise((resolve, reject) => {
    if (!tabId) {
      resolve(undefined);
      return;
    }

    const sendRequest = () => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "itdog.page.meegle.auth_code.request",
          payload: { pluginId, state, baseUrl },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const errorMessage = chrome.runtime.lastError.message ||
              "Current tab is not a Meegle auth page";

            console.error(
              "[Tenways Octo] Failed to send message to content script:",
              chrome.runtime.lastError,
            );
            reject(
              new MeegleAuthCodeRequestError(
                "MEEGLE_PAGE_REQUIRED",
                errorMessage,
              ),
            );
            return;
          }

          if (response?.ok && response?.data) {
            resolve({
              authCode: response.data.authCode,
              state: response.data.state,
              issuedAt: response.data.issuedAt,
            });
          } else {
            console.error("[Tenways Octo] Auth code request failed:", response?.error);
            reject(
              new MeegleAuthCodeRequestError(
                response?.error?.errorCode || "AUTH_CODE_REQUEST_FAILED",
                response?.error?.errorMessage || "Failed to obtain auth code from Meegle",
              ),
            );
          }
        },
      );
    };

    sendRequest();
  });
}

/**
 * Open Meegle login page in a new tab
 */
async function openMeegleLoginTab(baseUrl: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.create(
      {
        url: baseUrl,
        active: true,
      },
      () => {
        resolve();
      },
    );
  });
}

/**
 * Exchange auth code with server for user token
 */
async function exchangeAuthCodeWithServer(
  request: MeegleAuthEnsureRequest,
  authCode: string,
): Promise<MeegleAuthExchangeResponse | undefined> {
  try {
    const config = await getConfig();

    const response = await fetch(`${config.SERVER_URL}/api/meegle/auth/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: request.requestId,
        operatorLarkId: request.operatorLarkId,
        meegleUserKey: request.meegleUserKey,
        baseUrl: request.baseUrl,
        authCode,
        state: request.state,
      }),
    });

    if (!response.ok) {
      console.error("[Tenways Octo] Failed to exchange auth code:", response.status);
      return undefined;
    }

    const result = (await response.json()) as MeegleAuthExchangeResponse;
    return result;
  } catch (error) {
    console.error("[Tenways Octo] Error exchanging auth code:", error);
    return undefined;
  }
}

export async function ensureMeegleAuth(
  request: Partial<MeegleAuthEnsureRequest> = {},
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  const baseUrl = request.baseUrl ?? "https://project.larksuite.com";
  const state = request.state || `state_${Date.now()}`;

  // Validate required fields
  if (!request.requestId || !request.operatorLarkId) {
    return {
      status: "failed",
      baseUrl,
      reason: "MEEGLE_AUTH_REQUIRED_FIELDS_MISSING",
    };
  }

  const cachedToken = deps.getCachedToken?.();

  if (cachedToken) {
    return {
      status: "ready",
      baseUrl,
      state,
    };
  }

  // Try to get auth code from content script
  const pluginId = deps.getCachedPluginId?.();

  if (!isConfiguredPluginId(pluginId)) {
    console.error("[Tenways Octo] Plugin ID not configured");
    return {
      status: "failed",
      baseUrl,
      reason: "PLUGIN_ID_NOT_CONFIGURED",
    };
  }

  const requestAuthCode = deps.requestAuthCodeFromContentScript ?? requestAuthCodeFromContentScript;

  if (!request.currentPageIsMeegle || !request.currentTabId) {
    return {
      status: "failed",
      baseUrl,
      state,
      reason: "MEEGLE_PAGE_REQUIRED",
    };
  }

  let authResult: MeegleAuthCodeResponse | undefined;

  try {
    authResult = await requestAuthCode(
      pluginId,
      state,
      baseUrl,
      request.currentTabId,
    );
  } catch (error) {
    if (error instanceof MeegleAuthCodeRequestError) {
      return {
        status: "failed",
        baseUrl,
        state,
        reason: error.code,
        errorMessage: error.message,
      };
    }

    return {
      status: "failed",
      baseUrl,
      state,
      reason: "AUTH_CODE_REQUEST_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  if (authResult) {
    if (authResult.state !== state) {
      return {
        status: "failed",
        baseUrl,
        state,
        reason: "MEEGLE_AUTH_CODE_STATE_MISMATCH",
      };
    }

    await deps.saveAuthCode?.(authResult);

    if (!request.meegleUserKey) {
      return {
        status: "failed",
        baseUrl,
        state: authResult.state,
        authCode: authResult.authCode,
        issuedAt: authResult.issuedAt,
        credentialStatus: "auth_code_received",
        reason: "MEEGLE_USER_KEY_REQUIRED",
      };
    }

    // Exchange auth code with server for token
    const exchangeWithServer = deps.exchangeAuthCodeWithServer ?? exchangeAuthCodeWithServer;
    const exchangeResult = await exchangeWithServer(request as MeegleAuthEnsureRequest, authResult.authCode);

    if (exchangeResult?.ok && exchangeResult.data?.tokenStatus === "ready") {
      return {
        status: "ready",
        baseUrl,
        state: authResult.state,
        authCode: authResult.authCode,
        issuedAt: authResult.issuedAt,
        credentialStatus: "token_ready",
      };
    }

    // Exchange failed
    console.error("[Tenways Octo] Auth code exchange failed:", exchangeResult?.error);
    return {
      status: "failed",
      baseUrl,
      state: authResult.state,
      reason: exchangeResult?.error?.errorCode || "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
    };
  }

  // Auth code not obtained, need user to login
  const openTab = deps.openMeegleLoginTab ?? openMeegleLoginTab;
  await openTab(baseUrl);

  return {
    status: "require_auth_code",
    baseUrl,
    state,
    reason: "NEED_USER_LOGIN",
  };
}

export async function runAuthBridgeFlow(
  request: MeegleAuthEnsureRequest,
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  return ensureMeegleAuth(request, deps);
}
