import type {
  MeegleAuthCodeResponse,
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
  MeegleAuthExchangeResponse,
} from "../../types/meegle";
import { normalizeMeegleAuthBaseUrl } from "../../platform-url.js";
import { getConfig } from "../config.js";

class MeegleAuthCodeRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MeegleAuthCodeRequestError";
  }
}

const BG_FLOW_PREFIX = "[MEEGLE_AUTH_FLOW][BG]";

function logBgFlow(node: string, phase: "START" | "OK" | "FAIL", detail: Record<string, unknown>): void {
  const logger = phase === "FAIL" ? console.error : console.log;
  logger(`${BG_FLOW_PREFIX}[${node}][${phase}]`, detail);
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
      logBgFlow("AUTH_CODE_REQUEST", "START", { tabId, baseUrl, state, pluginIdSuffix: pluginId.slice(-6) });
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
            logBgFlow("AUTH_CODE_REQUEST", "OK", { tabId, baseUrl, state: response.data.state, issuedAt: response.data.issuedAt });
            resolve({
              authCode: response.data.authCode,
              state: response.data.state,
              issuedAt: response.data.issuedAt,
            });
          } else {
            logBgFlow("AUTH_CODE_REQUEST", "FAIL", { tabId, baseUrl, state, error: response?.error });
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
  let serverUrl = "unknown";

  try {
    const config = await getConfig();
    serverUrl = config.SERVER_URL;

    logBgFlow("SERVER_EXCHANGE", "START", { serverUrl, requestId: request.requestId, operatorLarkId: request.operatorLarkId, meegleUserKey: request.meegleUserKey, baseUrl: request.baseUrl });

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

    const parseErrorResponse = async (): Promise<MeegleAuthExchangeResponse> => {
      try {
        const errorResult = (await response.json()) as MeegleAuthExchangeResponse;
        if (errorResult?.error?.errorMessage) {
          return errorResult;
        }
      } catch {
        // Fall through to generic error body.
      }

      return {
        ok: false,
        error: {
          errorCode: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
          errorMessage: `Server returned ${response.status} during auth code exchange`,
        },
      };
    };

    if (!response.ok) {
      const errorResult = await parseErrorResponse();
      console.error("[Tenways Octo] Failed to exchange auth code:", {
        status: response.status,
        requestId: request.requestId,
        operatorLarkId: request.operatorLarkId,
        meegleUserKey: request.meegleUserKey,
        baseUrl: request.baseUrl,
        error: errorResult.error,
      });
      return errorResult;
    }

    const result = (await response.json()) as MeegleAuthExchangeResponse;
    logBgFlow("SERVER_EXCHANGE", result?.ok ? "OK" : "FAIL", { serverUrl, requestId: request.requestId, baseUrl: request.baseUrl, responseOk: result?.ok, tokenStatus: result?.data?.tokenStatus, error: result?.error });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Tenways Octo] Error exchanging auth code:", {
      serverUrl,
      requestId: request.requestId,
      operatorLarkId: request.operatorLarkId,
      meegleUserKey: request.meegleUserKey,
      baseUrl: request.baseUrl,
      message,
    });
    return {
      ok: false,
      error: {
        errorCode: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
        errorMessage: `Failed to reach ${serverUrl}: ${message}`,
      },
    };
  }
}

export async function ensureMeegleAuth(
  request: Partial<MeegleAuthEnsureRequest> = {},
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  const config = await getConfig();
  const baseUrl = normalizeMeegleAuthBaseUrl(
    request.baseUrl ?? request.pageOrigin,
    config.MEEGLE_BASE_URL,
  );
  const state = request.state || `state_${Date.now()}`;

  logBgFlow("ENSURE_AUTH", "START", { requestId: request.requestId, operatorLarkId: request.operatorLarkId, meegleUserKey: request.meegleUserKey, baseUrl, pageOrigin: request.pageOrigin, currentTabId: request.currentTabId, currentPageIsMeegle: request.currentPageIsMeegle });

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
    logBgFlow("ENSURE_AUTH", "OK", { requestId: request.requestId, baseUrl, source: "cached_token" });
    return {
      status: "ready",
      baseUrl,
      state,
    };
  }

  // Try to get auth code from content script
  const pluginId = deps.getCachedPluginId?.();

  if (!isConfiguredPluginId(pluginId)) {
    logBgFlow("ENSURE_AUTH", "FAIL", { requestId: request.requestId, baseUrl, reason: "PLUGIN_ID_NOT_CONFIGURED" });
    console.error("[Tenways Octo] Plugin ID not configured");
    return {
      status: "failed",
      baseUrl,
      reason: "PLUGIN_ID_NOT_CONFIGURED",
    };
  }

  const requestAuthCode = deps.requestAuthCodeFromContentScript ?? requestAuthCodeFromContentScript;

  if (!request.currentPageIsMeegle || !request.currentTabId) {
    logBgFlow("ENSURE_AUTH", "FAIL", { requestId: request.requestId, baseUrl, reason: "MEEGLE_PAGE_REQUIRED", currentTabId: request.currentTabId, currentPageIsMeegle: request.currentPageIsMeegle });
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
    logBgFlow("AUTH_CODE_RECEIVED", "OK", { requestId: request.requestId, baseUrl, authCodeSuffix: authResult.authCode.slice(-6), state: authResult.state, issuedAt: authResult.issuedAt });
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
      logBgFlow("ENSURE_AUTH", "OK", { requestId: request.requestId, baseUrl, source: "server_exchange", credentialStatus: exchangeResult.data.credentialStatus, expiresAt: exchangeResult.data.expiresAt });
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
    logBgFlow("ENSURE_AUTH", "FAIL", { requestId: request.requestId, baseUrl, reason: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED", error: exchangeResult?.error });
    console.error("[Tenways Octo] Auth code exchange failed:", exchangeResult?.error);
    return {
      status: "failed",
      baseUrl,
      state: authResult.state,
      reason: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
      errorMessage:
        exchangeResult?.error?.errorMessage || "Meegle auth code exchange failed on server",
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
