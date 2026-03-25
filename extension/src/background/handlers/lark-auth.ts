import type {
  LarkAuthCodeResponse,
  LarkAuthEnsureRequest,
  LarkAuthEnsureResponse,
} from "../../types/lark";

export interface EnsureLarkAuthDeps {
  getCachedLarkToken?: () => string | undefined;
  saveLarkAuthCode?: (response: LarkAuthCodeResponse) => Promise<void>;
  requestAuthCodeFromContentScript?: (
    baseUrl: string,
  ) => Promise<{ code: string; state: string } | undefined>;
  requestLarkUserId?: () => Promise<string | undefined>;
  openLarkOAuthTab?: (baseUrl: string, state: string, appId?: string) => Promise<void>;
  exchangeAuthCodeWithServer?: (
    code: string,
    operatorLarkId: string,
    baseUrl: string,
  ) => Promise<LarkAuthCodeResponse | undefined>;
  appId?: string;
}

/**
 * Request auth code from Lark content script
 * Checks all *.larksuite.com and *.feishu.cn tabs
 */
async function requestAuthCodeFromContentScript(
  baseUrl: string,
): Promise<{ code: string; state: string } | undefined> {
  return new Promise((resolve) => {
    // Check all Lark/Feishu tabs, not just a specific baseUrl
    chrome.tabs.query({ url: ["*://*.larksuite.com/*", "*://*.feishu.cn/*"] }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.error("[Tenways Octo] No Lark tab found");
        resolve(undefined);
        return;
      }

      // Prefer tabs that match the baseUrl, otherwise use any Lark tab
      let larkTab = tabs.find(t => t.url?.startsWith(baseUrl));
      if (!larkTab) {
        larkTab = tabs[0];
      }

      // Send message to content script
      chrome.tabs.sendMessage(
        larkTab.id!,
        {
          action: "getLarkAuthCode",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Tenways Octo] Failed to send message to Lark content script:", chrome.runtime.lastError);
            resolve(undefined);
            return;
          }

          if (response?.code && response?.state) {
            resolve({
              code: response.code,
              state: response.state,
            });
          } else {
            console.error("[Tenways Octo] Auth code request failed:", response);
            resolve(undefined);
          }
        },
      );
    });
  });
}

/**
 * Request Lark user ID from content script
 * Checks all *.larksuite.com and *.feishu.cn tabs
 */
async function requestLarkUserId(): Promise<string | undefined> {
  return new Promise((resolve) => {
    // First try active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];

      // If active tab is a Lark page, use it
      if (activeTab?.url && (activeTab.url.includes('larksuite.com') || activeTab.url.includes('feishu.cn'))) {
        chrome.tabs.sendMessage(
          activeTab.id!,
          {
            action: "getLarkUserId",
          },
          (response) => {
            if (!chrome.runtime.lastError && response?.userId) {
              resolve(response.userId);
              return;
            }
            // Fall through to search all Lark tabs
            searchAllLarkTabs(resolve);
          },
        );
      } else {
        // Active tab is not Lark, search all Lark tabs
        searchAllLarkTabs(resolve);
      }
    });
  });
}

/**
 * Search all Lark tabs for user ID
 */
function searchAllLarkTabs(resolve: (value: string | undefined) => void): void {
  chrome.tabs.query({ url: ["*://*.larksuite.com/*", "*://*.feishu.cn/*"] }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      console.error("[Tenways Octo] No Lark tab found for user ID");
      resolve(undefined);
      return;
    }

    const larkTab = tabs[0];
    chrome.tabs.sendMessage(
      larkTab.id!,
      {
        action: "getLarkUserId",
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[Tenways Octo] Failed to get Lark user ID:", chrome.runtime.lastError);
          resolve(undefined);
          return;
        }

        resolve(response?.userId);
      },
    );
  });
}

/**
 * Open Lark OAuth authorization page
 */
async function openLarkOAuthTab(baseUrl: string, state: string, appId?: string): Promise<void> {
  return new Promise((resolve) => {
    // Use provided appId or fallback to config
    const APP_ID = appId || "cli_a4b5c6d7e8f9"; // TODO: Configure via extension storage
    const redirectUri = "http://localhost:3000/api/lark/auth/callback";
    const scope = "contact:readonly:user";

    const oauthUrl = `https://open.larksuite.com/service-open/oauth/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}&response_type=code`;

    chrome.tabs.create(
      {
        url: oauthUrl,
        active: true,
      },
      () => {
        resolve();
      },
    );
  });
}

/**
 * Exchange auth code with server
 */
async function exchangeAuthCodeWithServer(
  code: string,
  operatorLarkId: string,
  baseUrl: string,
): Promise<LarkAuthCodeResponse | undefined> {
  try {
    const response = await fetch("http://localhost:3000/api/lark/auth/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operatorLarkId,
        baseUrl,
        code,
        grantType: "authorization_code",
      }),
    });

    if (!response.ok) {
      console.error("[Tenways Octo] Failed to exchange Lark auth code:", response.status);
      return undefined;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("[Tenways Octo] Error exchanging Lark auth code:", error);
    return undefined;
  }
}

export async function ensureLarkAuth(
  request: Partial<LarkAuthEnsureRequest> = {},
  deps: EnsureLarkAuthDeps = {},
): Promise<LarkAuthEnsureResponse> {
  const baseUrl = request.baseUrl ?? "https://open.larksuite.com";
  const state = request.state || `state_${Date.now()}`;

  // Check if we have a cached token
  const cachedToken = deps.getCachedLarkToken?.();

  if (cachedToken) {
    return {
      status: "ready",
      baseUrl,
      state,
    };
  }

  // Try to get auth code from content script
  const requestAuthCode = deps.requestAuthCodeFromContentScript ?? requestAuthCodeFromContentScript;
  const authResult = await requestAuthCode(baseUrl);

  if (authResult) {
    // We have an auth code from the redirect URL
    // Need to get user ID and exchange for token
    const requestUserId = deps.requestLarkUserId ?? requestLarkUserId;
    const operatorLarkId = request.operatorLarkId || await requestUserId();

    if (!operatorLarkId) {
      return {
        status: "failed",
        baseUrl,
        reason: "LARK_USER_ID_NOT_FOUND",
      };
    }

    // Exchange auth code for token
    const exchangeToken = deps.exchangeAuthCodeWithServer ?? exchangeAuthCodeWithServer;
    const exchangeResult = await exchangeToken(authResult.code, operatorLarkId, baseUrl);

    if (exchangeResult?.ok && exchangeResult.data) {
      return {
        status: "ready",
        baseUrl,
        state: authResult.state,
        authCode: authResult.code,
        tokenPair: exchangeResult.data,
      };
    }

    return {
      status: "failed",
      baseUrl,
      reason: "LARK_AUTH_CODE_EXCHANGE_FAILED",
    };
  }

  // Auth code not obtained, need user to authorize
  const openOAuthTab = deps.openLarkOAuthTab ?? openLarkOAuthTab;
  await openOAuthTab(baseUrl, state, deps.appId);

  return {
    status: "require_auth_code",
    baseUrl,
    state,
    reason: "NEED_USER_AUTHORIZATION",
  };
}

export async function runLarkAuthFlow(
  request: LarkAuthEnsureRequest,
  deps: EnsureLarkAuthDeps = {},
): Promise<LarkAuthEnsureResponse> {
  return ensureLarkAuth(request, deps);
}
