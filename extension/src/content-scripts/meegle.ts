// Meegle content script - handles auth code requests
// Runs on https://*.meegle.com/* pages

export interface MeegleAuthCodeResult {
  authCode: string;
  state: string;
  issuedAt: string;
}

/**
 * Get auth code from Meegle BFF API using current page cookie
 */
async function getAuthCodeFromMeegleApi(
  pluginId: string,
  state: string,
  baseUrl: string = "https://project.larksuite.com",
): Promise<MeegleAuthCodeResult | null> {
  try {
    // Get current page cookie
    const cookie = document.cookie;

    if (!cookie || cookie.length === 0) {
      console.error("[IT PM Assistant] No cookie found on current page");
      return null;
    }

    console.log("[IT PM Assistant] Getting auth code from Meegle API...");

    // Call Meegle BFF auth code API
    const response = await fetch(`${baseUrl}/bff/v2/authen/v1/auth_code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookie,
      },
      body: JSON.stringify({
        plugin_id: pluginId,
        state: state,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[IT PM Assistant] Auth code API error:", response.status, errorText);
      return null;
    }

    const data = await response.json() as {
      data?: { code?: string };
      code?: string;
      auth_code?: string;
      error?: { code?: number; msg?: string };
    };

    // Check for error in response
    if (data.error && data.error.code !== 0) {
      console.error("[IT PM Assistant] Auth code error:", data.error.msg);
      return null;
    }

    // Extract auth code from response
    const authCode = data.data?.code ?? data.code ?? data.auth_code;

    if (typeof authCode !== "string" || authCode.length === 0) {
      console.error("[IT PM Assistant] Invalid auth code in response");
      return null;
    }

    console.log("[IT PM Assistant] Auth code obtained successfully");

    return {
      authCode,
      state,
      issuedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[IT PM Assistant] Failed to get auth code:", err);
    return null;
  }
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

export function initMeegleContentScript() {
  console.log("[IT PM Assistant] Meegle content script initialized");

  // Listen for auth code requests from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "itdog.page.meegle.auth_code.request") {
      const { pluginId, state, baseUrl } = message.payload;

      requestAuthCode(pluginId, state, baseUrl)
        .then((result) => {
          if (result) {
            sendResponse({
              ok: true,
              data: result,
            });
          } else {
            sendResponse({
              ok: false,
              error: {
                errorCode: "AUTH_CODE_REQUEST_FAILED",
                errorMessage: "Failed to obtain auth code from Meegle",
              },
            });
          }
        })
        .catch((err: Error) => {
          sendResponse({
            ok: false,
            error: {
              errorCode: "AUTH_CODE_ERROR",
              errorMessage: err.message,
            },
          });
        });

      return true; // Keep channel open for async response
    }
  });
}

// Initialize when script loads
initMeegleContentScript();
