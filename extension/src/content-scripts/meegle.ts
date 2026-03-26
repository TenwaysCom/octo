// Meegle content script - handles auth code requests and user identity
// Runs on https://*.meegle.com/* pages

interface MeegleAuthCodeResult {
  authCode: string;
  state: string;
  issuedAt: string;
}

interface MeegleUserIdentity {
  userKey: string | null;
  userName: string | null;
  tenantKey: string | null;
}

interface TenwaysMeegleTestingApi {
  getMeegleUserIdentity: () => MeegleUserIdentity;
  getAuthCodeFromMeegleApi: (
    pluginId: string,
    state: string,
    baseUrl?: string,
  ) => Promise<MeegleAuthCodeResult | null>;
  initMeegleContentScript: () => void;
}

/**
 * Get user identity from Meegle page
 */
function getMeegleUserIdentity(): MeegleUserIdentity {
  const identity: MeegleUserIdentity = {
    userKey: null,
    userName: null,
    tenantKey: null,
  };

  // Try to extract from global variables or API responses
  try {
    // Check for Meegle global objects
    // @ts-ignore
    if (window.__MEEGLE_CONTEXT__?.user) {
      // @ts-ignore
      const user = window.__MEEGLE_CONTEXT__.user;
      identity.userKey = user.userKey || user.user_key || user.id;
      identity.userName = user.name || user.userName;
      identity.tenantKey = user.tenantKey || user.tenant_key;
    }

    // Try to find from meta tags
    if (!identity.userKey) {
      const metaUserKey = document.querySelector('meta[name="user-key"]') as HTMLMetaElement;
      if (metaUserKey) {
        identity.userKey = metaUserKey.content;
      }
    }

    // Try to find from data attributes
    if (!identity.userKey) {
      const userElement = document.querySelector('[data-user-key]') as HTMLElement;
      if (userElement?.dataset.userKey) {
        identity.userKey = userElement.dataset.userKey;
      }
    }

    // Try to get from URL or page context
    if (!identity.userKey) {
      // Check localStorage or sessionStorage
      const storedUser = localStorage.getItem('meegle_user') || sessionStorage.getItem('meegle_user');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          identity.userKey = userData.userKey || userData.user_key;
          identity.userName = userData.name || userData.userName;
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Try to get tenant key from URL
    if (!identity.tenantKey) {
      const urlMatch = window.location.pathname.match(/\/tenant\/([^/]+)/);
      if (urlMatch) {
        identity.tenantKey = urlMatch[1];
      }
    }
  } catch (err) {
    console.error("[Tenways Octo] Error getting Meegle user identity:", err);
  }

  return identity;
}

/**
 * Get auth code from Meegle BFF API using current page cookie
 */
async function getAuthCodeFromMeegleApi(
  pluginId: string,
  state: string,
  baseUrl: string = "https://project.larksuite.com",
): Promise<MeegleAuthCodeResult | null> {
  console.log("[Tenways Octo] Getting auth code from Meegle API...");

  // Call Meegle BFF auth code API
  // Note: credentials 'include' ensures cookies are sent automatically
  const response = await fetch(`${baseUrl}/bff/v2/authen/v1/auth_code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      plugin_id: pluginId,
      state: state,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Tenways Octo] Auth code API error:", response.status, errorText);
    throw new Error(`Auth code API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    data?: { code?: string };
    code?: string;
    auth_code?: string;
    error?: { code?: number; msg?: string };
  };

  // Check for error in response
  if (data.error && data.error.code !== 0) {
    console.error("[Tenways Octo] Auth code error:", data.error.msg);
    throw new Error(data.error.msg || "Auth code request failed");
  }

  // Extract auth code from response
  const authCode = data.data?.code ?? data.code ?? data.auth_code;

  if (typeof authCode !== "string" || authCode.length === 0) {
    console.error("[Tenways Octo] Invalid auth code in response");
    throw new Error("Invalid auth code in response");
  }

  console.log("[Tenways Octo] Auth code obtained successfully");

  return {
    authCode,
    state,
    issuedAt: new Date().toISOString(),
  };
}

/**
 * Request auth code - called from background script
 */
async function requestAuthCode(
  pluginId: string,
  state: string,
  baseUrl?: string,
): Promise<MeegleAuthCodeResult | null> {
  return getAuthCodeFromMeegleApi(pluginId, state, baseUrl);
}

function initMeegleContentScript() {
  console.log("[Tenways Octo] Meegle content script initialized");

  // Listen for auth code requests from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "itdog.page.meegle.auth_code.request") {
      const { pluginId, state, baseUrl } = message.payload;

      requestAuthCode(pluginId, state, baseUrl)
        .then((result) => {
          sendResponse({
            ok: true,
            data: result,
          });
        })
        .catch((err: Error) => {
          sendResponse({
            ok: false,
            error: {
              errorCode: "AUTH_CODE_REQUEST_FAILED",
              errorMessage: err.message,
            },
          });
        });

      return true; // Keep channel open for async response
    }

    // Handle user identity request
    if (message.action === "getMeegleUserIdentity") {
      const identity = getMeegleUserIdentity();
      sendResponse(identity);
    }
  });
}

const meegleTestingTarget = globalThis as typeof globalThis & {
  __TENWAYS_MEEGLE_TESTING__?: TenwaysMeegleTestingApi;
};

meegleTestingTarget.__TENWAYS_MEEGLE_TESTING__ = {
  getMeegleUserIdentity,
  getAuthCodeFromMeegleApi,
  initMeegleContentScript,
};

// Initialize when script loads
initMeegleContentScript();
