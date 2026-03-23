import type {
  MeegleAuthCodeResponse,
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "../../types/meegle";

export interface EnsureMeegleAuthDeps {
  getCachedToken?: () => string | undefined;
  getCachedPluginId?: () => string | undefined;
  saveAuthCode?: (response: MeegleAuthCodeResponse) => Promise<void>;
  requestAuthCodeFromContentScript?: (
    pluginId: string,
    state: string,
    baseUrl: string,
  ) => Promise<MeegleAuthCodeResponse | undefined>;
  openMeegleLoginTab?: (baseUrl: string) => Promise<void>;
}

/**
 * Request auth code from Meegle content script
 */
async function requestAuthCodeFromContentScript(
  pluginId: string,
  state: string,
  baseUrl: string,
): Promise<MeegleAuthCodeResponse | undefined> {
  return new Promise((resolve) => {
    // Find Meegle tab
    chrome.tabs.query({ url: baseUrl + "/*" }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.error("[IT PM Assistant] No Meegle tab found");
        resolve(undefined);
        return;
      }

      const meegleTab = tabs[0];

      // Send message to content script
      chrome.tabs.sendMessage(
        meegleTab.id!,
        {
          action: "itdog.page.meegle.auth_code.request",
          payload: { pluginId, state, baseUrl },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[IT PM Assistant] Failed to send message to content script:", chrome.runtime.lastError);
            resolve(undefined);
            return;
          }

          if (response?.ok && response?.data) {
            resolve({
              authCode: response.data.authCode,
              state: response.data.state,
              issuedAt: response.data.issuedAt,
            });
          } else {
            console.error("[IT PM Assistant] Auth code request failed:", response?.error);
            resolve(undefined);
          }
        },
      );
    });
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

export async function ensureMeegleAuth(
  request: Partial<MeegleAuthEnsureRequest> = {},
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  const baseUrl = request.baseUrl ?? "https://project.larksuite.com";
  const state = request.state || `state_${Date.now()}`;

  if (!request.requestId || !request.operatorLarkId) {
    return {
      status: "failed",
      baseUrl,
      reason: "MEEGLE_AUTH_REQUIRED",
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

  if (!pluginId) {
    console.error("[IT PM Assistant] Plugin ID not configured");
    return {
      status: "failed",
      baseUrl,
      reason: "PLUGIN_ID_NOT_CONFIGURED",
    };
  }

  const requestAuthCode = deps.requestAuthCodeFromContentScript ?? requestAuthCodeFromContentScript;

  const authResult = await requestAuthCode(pluginId, state, baseUrl);

  if (authResult) {
    if (authResult.state !== state) {
      return {
        status: "failed",
        baseUrl,
        state,
        reason: "MEEGLE_AUTH_CODE_STATE_MISMATCH",
      };
    }

    // Save auth code for later exchange
    await deps.saveAuthCode?.(authResult);

    return {
      status: "ready",
      baseUrl,
      state: authResult.state,
      authCode: authResult.authCode,
      issuedAt: authResult.issuedAt,
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
