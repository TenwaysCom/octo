// Meegle content script - handles auth code requests and user identity
// Runs on https://*.meegle.com/* pages

import { injectSidebar } from "./shared/sidebar-injector";
import { createExtensionLogger } from "../logger.js";

const meegleCsLogger = createExtensionLogger("content-script:meegle");

function summarizeIdentifier(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

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

type MeegleIdentitySource =
  | "context"
  | "meta"
  | "data-attr"
  | "storage"
  | "cookie"
  | "url"
  | "not_found";

interface TenwaysMeegleTestingApi {
  getMeegleUserIdentity: () => MeegleUserIdentity;
  getAuthCodeFromMeegleApi: (
    pluginId: string,
    state: string,
    baseUrl?: string,
  ) => Promise<MeegleAuthCodeResult | null>;
  initMeegleContentScript: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

function logMcsFlow(node: string, phase: "START" | "OK" | "FAIL", detail: Record<string, unknown>): void {
  const message = `[MEEGLE_AUTH_FLOW][MCS][${node}][${phase}]`;
  if (phase === "FAIL") {
    meegleCsLogger.error(message, detail);
  } else {
    meegleCsLogger.info(message, detail);
  }
}

function getPageLocation(): { href?: string; origin?: string } {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    href: window.location?.href,
    origin: window.location?.origin,
  };
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined" || !document.cookie) {
    return null;
  }

  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const cookieName =
      separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;

    if (cookieName !== name) {
      continue;
    }

    const rawValue =
      separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : "";

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function readStoredMeegleUser():
  | {
      userKey: string | null;
      userName: string | null;
      tenantKey: string | null;
    }
  | undefined {
  const storageKeys = ["meegle_user", "meegle_user_profile"];
  const sources = [localStorage, sessionStorage];

  for (const storage of sources) {
    for (const key of storageKeys) {
      const raw = storage.getItem(key);
      if (!raw) {
        continue;
      }

      try {
        const userData = JSON.parse(raw) as Record<string, unknown>;
        return {
          userKey:
            (typeof userData.userKey === "string" && userData.userKey)
            || (typeof userData.user_key === "string" && userData.user_key)
            || null,
          userName:
            (typeof userData.name === "string" && userData.name)
            || (typeof userData.userName === "string" && userData.userName)
            || null,
          tenantKey:
            (typeof userData.tenantKey === "string" && userData.tenantKey)
            || (typeof userData.tenant_key === "string" && userData.tenant_key)
            || null,
        };
      } catch {
        // Ignore parse errors and keep searching.
      }
    }
  }

  return undefined;
}

function logIdentityResolution(
  source: MeegleIdentitySource,
  identity: MeegleUserIdentity,
): void {
  meegleCsLogger.debug("meegleIdentity.resolve", {
    source,
    hasUserKey: Boolean(identity.userKey),
    userKey: summarizeIdentifier(identity.userKey),
    tenantKey: summarizeIdentifier(identity.tenantKey),
    hasUserName: Boolean(identity.userName),
    location: getPageLocation().href,
  });
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
  let source: MeegleIdentitySource = "not_found";

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
      if (identity.userKey) {
        source = "context";
      }
    }

    // Try to find from meta tags
    if (!identity.userKey) {
      const metaUserKey = document.querySelector('meta[name="user-key"]') as HTMLMetaElement;
      if (metaUserKey) {
        identity.userKey = metaUserKey.content;
        if (identity.userKey) {
          source = "meta";
        }
      }
    }

    // Try to find from data attributes
    if (!identity.userKey) {
      const userElement = document.querySelector('[data-user-key]') as HTMLElement;
      if (userElement?.dataset.userKey) {
        identity.userKey = userElement.dataset.userKey;
        source = "data-attr";
      }
    }

    // Try to get from storage snapshots
    if (!identity.userKey) {
      const storedUser = readStoredMeegleUser();
      if (storedUser?.userKey) {
        identity.userKey = storedUser.userKey;
        identity.userName = storedUser.userName;
        identity.tenantKey = storedUser.tenantKey;
        source = "storage";
      }
    }

    if (!identity.userKey) {
      identity.userKey = getCookieValue("meego_user_key");
      if (identity.userKey) {
        source = "cookie";
      }
    }

    if (!identity.tenantKey) {
      identity.tenantKey = getCookieValue("meego_tenant_key");
    }

    // Try to get tenant key from URL
    if (!identity.tenantKey) {
      const urlMatch = window.location.pathname.match(/\/tenant\/([^/]+)/);
      if (urlMatch) {
        identity.tenantKey = urlMatch[1];
        if (source === "not_found") {
          source = "url";
        }
      }
    }
  } catch (err) {
    meegleCsLogger.error("Error getting Meegle user identity", { error: err instanceof Error ? err.message : String(err) });
  }

  logIdentityResolution(source, identity);

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
  logMcsFlow("AUTH_CODE_API", "START", { baseUrl, state, pluginIdSuffix: pluginId.slice(-6), location: getPageLocation().origin });
  meegleCsLogger.info("Getting auth code from Meegle API...");

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
    logMcsFlow("AUTH_CODE_API", "FAIL", { baseUrl, status: response.status, errorText });
    meegleCsLogger.error("Auth code API error", { status: response.status, errorText });
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
    logMcsFlow("AUTH_CODE_API", "FAIL", { baseUrl, errorCode: data.error.code, errorMessage: data.error.msg });
    meegleCsLogger.error("Auth code error", { errorMessage: data.error.msg });
    throw new Error(data.error.msg || "Auth code request failed");
  }

  // Extract auth code from response
  const authCode = data.data?.code ?? data.code ?? data.auth_code;

  if (typeof authCode !== "string" || authCode.length === 0) {
    logMcsFlow("AUTH_CODE_API", "FAIL", { baseUrl, reason: "INVALID_AUTH_CODE_RESPONSE", keys: Object.keys(data) });
    meegleCsLogger.error("Invalid auth code in response");
    throw new Error("Invalid auth code in response");
  }

  logMcsFlow("AUTH_CODE_API", "OK", { baseUrl, state, authCodeSuffix: authCode.slice(-6) });
  meegleCsLogger.info("Auth code obtained successfully");

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
  meegleCsLogger.info("Meegle content script initialized");

  // Inject floating sidebar trigger on Meegle pages
  const meegleIdentity = getMeegleUserIdentity();
  const meegleSidebar = injectSidebar({
    hostPageType: "meegle",
    hostUrl: typeof window !== "undefined" ? window.location.href : undefined,
    hostOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
    meegleUserKey: meegleIdentity.userKey ?? undefined,
  });

  meegleTestingTarget.__TENWAYS_MEEGLE_TESTING__ = {
    getMeegleUserIdentity,
    getAuthCodeFromMeegleApi,
    initMeegleContentScript,
    openSidebar: meegleSidebar.open,
    closeSidebar: meegleSidebar.close,
    toggleSidebar: meegleSidebar.toggle,
  };

  // Listen for auth code requests from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "itdog.page.meegle.auth_code.request") {
      const { pluginId, state, baseUrl } = message.payload;
      logMcsFlow("MESSAGE_RECEIVED", "START", { action: message.action, baseUrl, state, pluginIdSuffix: typeof pluginId === "string" ? pluginId.slice(-6) : undefined, location: getPageLocation().href });

      requestAuthCode(pluginId, state, baseUrl)
        .then((result) => {
          logMcsFlow("MESSAGE_RECEIVED", "OK", { action: message.action, state: result?.state, issuedAt: result?.issuedAt });
          sendResponse({
            ok: true,
            data: result,
          });
        })
        .catch((err: Error) => {
          logMcsFlow("MESSAGE_RECEIVED", "FAIL", { action: message.action, errorMessage: err.message });
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

// Initialize when script loads
initMeegleContentScript();

export {};
