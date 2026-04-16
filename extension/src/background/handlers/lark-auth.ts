import type {
  LarkAuthCallbackResult,
  LarkAuthEnsureRequest,
  LarkAuthEnsureResponse,
  LarkAuthSessionServerResponse,
  LarkAuthStatusServerResponse,
} from "../../types/lark.js";
import {
  DEFAULT_LARK_AUTH_BASE_URL,
  normalizeLarkAuthBaseUrl,
} from "../../platform-url.js";
import { getConfig } from "../config.js";
import { createExtensionLogger } from "../../logger.js";

const larkAuthLogger = createExtensionLogger("background:lark-auth");

export interface EnsureLarkAuthDeps {
  getCachedLarkToken?: () => string | undefined;
  getAuthStatusFromServer?: (request: {
    masterUserId: string;
    baseUrl: string;
  }) => Promise<LarkAuthStatusServerResponse>;
  createOauthSessionWithServer?: (request: {
    masterUserId: string;
    baseUrl: string;
    state: string;
  }) => Promise<LarkAuthSessionServerResponse>;
  savePendingLarkOauthState?: (input: {
    state: string;
    startedAt: string;
    baseUrl: string;
    masterUserId?: string;
  }) => Promise<void>;
  saveLastLarkAuthResult?: (result: LarkAuthCallbackResult) => Promise<void>;
  clearPendingLarkOauthState?: (state?: string) => Promise<void>;
  openLarkOAuthTab?: (
    baseUrl: string,
    state: string,
    appId?: string,
    callbackUrl?: string,
  ) => Promise<void>;
  appId?: string;
  callbackUrl?: string;
}

export function buildLarkOauthUrl(
  baseUrl: string,
  state: string,
  appId?: string,
  callbackUrl = "http://localhost:3000/api/lark/auth/callback",
  scope = "offline_access contact:user.base:readonly bitable:app email",
): string {
  const authorizeBaseUrl = baseUrl.includes("feishu.cn")
    ? "https://accounts.feishu.cn"
    : "https://accounts.larksuite.com";
  const resolvedAppId = appId || "cli_a4b5c6d7e8f9";
  const oauthUrl = new URL("/open-apis/authen/v1/authorize", authorizeBaseUrl);

  oauthUrl.searchParams.set("app_id", resolvedAppId);
  oauthUrl.searchParams.set("redirect_uri", callbackUrl);
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("scope", scope);
  oauthUrl.searchParams.set("response_type", "code");

  return oauthUrl.toString();
}

async function openLarkOAuthTab(
  baseUrl: string,
  state: string,
  appId?: string,
  callbackUrl?: string,
): Promise<void> {
  const config = await getConfig();
  return new Promise((resolve) => {
    chrome.tabs.create(
      {
        url: buildLarkOauthUrl(baseUrl, state, appId, callbackUrl, config.LARK_OAUTH_SCOPE),
        active: true,
      },
      () => resolve(),
    );
  });
}

async function getAuthStatusFromServer(
  request: {
    masterUserId: string;
    baseUrl: string;
  },
): Promise<LarkAuthStatusServerResponse> {
  const config = await getConfig();
  larkAuthLogger.info("Getting Lark auth status from server", { masterUserId: request.masterUserId, baseUrl: request.baseUrl });

  try {
    const response = await fetch(`${config.SERVER_URL}/api/lark/auth/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      larkAuthLogger.warn("Lark auth status request failed", { status: response.status });
      return {
        ok: false,
        error: {
          errorCode: "LARK_STATUS_REQUEST_FAILED",
          errorMessage: `Auth status request failed with ${response.status}.`,
        },
      };
    }

    const result = await response.json() as LarkAuthStatusServerResponse;
    larkAuthLogger.info("Lark auth status received", { ok: result.ok, status: result.data?.status });
    return result;
  } catch (error) {
    larkAuthLogger.error("Error getting Lark auth status", { error: error instanceof Error ? error.message : String(error) });
    return {
      ok: false,
      error: {
        errorCode: "LARK_STATUS_REQUEST_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function createOauthSessionWithServer(
  request: {
    masterUserId: string;
    baseUrl: string;
    state: string;
  },
): Promise<LarkAuthSessionServerResponse> {
  const config = await getConfig();
  larkAuthLogger.info("Creating Lark OAuth session", { masterUserId: request.masterUserId, baseUrl: request.baseUrl, state: request.state });

  try {
    const response = await fetch(`${config.SERVER_URL}/api/lark/auth/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      larkAuthLogger.warn("Lark OAuth session creation failed", { status: response.status });
      return {
        ok: false,
        error: {
          errorCode: "LARK_OAUTH_SESSION_CREATE_FAILED",
          errorMessage: `OAuth session request failed with ${response.status}.`,
        },
      };
    }

    const result = await response.json() as LarkAuthSessionServerResponse;
    larkAuthLogger.info("Lark OAuth session created", { ok: result.ok, state: result.data?.state });
    return result;
  } catch (error) {
    larkAuthLogger.error("Error creating Lark OAuth session", { error: error instanceof Error ? error.message : String(error) });
    return {
      ok: false,
      error: {
        errorCode: "LARK_OAUTH_SESSION_CREATE_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function ensureLarkAuth(
  request: Partial<LarkAuthEnsureRequest> = {},
  deps: EnsureLarkAuthDeps = {},
): Promise<LarkAuthEnsureResponse> {
  const baseUrl = normalizeLarkAuthBaseUrl(
    request.baseUrl ?? request.pageOrigin,
    DEFAULT_LARK_AUTH_BASE_URL,
  );
  const state = request.state || `state_${Date.now()}`;
  larkAuthLogger.info("Ensuring Lark auth", { masterUserId: request.masterUserId, baseUrl });

  if (!request.masterUserId) {
    larkAuthLogger.warn("Lark auth required fields missing");
    return {
      status: "failed",
      baseUrl,
      reason: "LARK_AUTH_REQUIRED_FIELDS_MISSING",
      errorMessage: "masterUserId is required for Lark auth.",
    };
  }

  const requestStatus = deps.getAuthStatusFromServer ?? getAuthStatusFromServer;
  const statusResult = await requestStatus({
    masterUserId: request.masterUserId,
    baseUrl,
  });

  if (statusResult.ok && statusResult.data?.status === "ready") {
    larkAuthLogger.info("Lark auth ready (cached)", { masterUserId: request.masterUserId, baseUrl: statusResult.data.baseUrl });
    return {
      status: "ready",
      baseUrl: statusResult.data.baseUrl,
      masterUserId: statusResult.data.masterUserId ?? request.masterUserId,
      reason: statusResult.data.reason,
      credentialStatus: statusResult.data.credentialStatus,
      expiresAt: statusResult.data.expiresAt,
    };
  }

  const createSession =
    deps.createOauthSessionWithServer ?? createOauthSessionWithServer;
  const sessionResult = await createSession({
    masterUserId: request.masterUserId,
    baseUrl,
    state,
  });

  if (!sessionResult.ok || !sessionResult.data) {
    larkAuthLogger.error("Lark OAuth session creation failed", { error: sessionResult.error });
    return {
      status: "failed",
      baseUrl,
      masterUserId: request.masterUserId,
      reason:
        sessionResult.error?.errorCode || "LARK_OAUTH_SESSION_CREATE_FAILED",
      errorMessage: sessionResult.error?.errorMessage,
    };
  }

  await deps.savePendingLarkOauthState?.({
    state: sessionResult.data.state,
    startedAt: new Date().toISOString(),
    baseUrl: sessionResult.data.baseUrl,
    masterUserId: request.masterUserId,
  });

  const launchOauth = deps.openLarkOAuthTab ?? openLarkOAuthTab;
  if (deps.callbackUrl) {
    await launchOauth(
      sessionResult.data.baseUrl,
      sessionResult.data.state,
      deps.appId,
      deps.callbackUrl,
    );
  } else {
    await launchOauth(
      sessionResult.data.baseUrl,
      sessionResult.data.state,
      deps.appId,
    );
  }

  larkAuthLogger.info("Lark OAuth pending", { masterUserId: request.masterUserId, state: sessionResult.data.state });
  return {
    status: "in_progress",
    baseUrl: sessionResult.data.baseUrl,
    masterUserId: request.masterUserId,
    state: sessionResult.data.state,
    reason: "LARK_OAUTH_PENDING",
  };
}

export async function handleLarkAuthCallbackDetected(
  result: LarkAuthCallbackResult,
  deps: EnsureLarkAuthDeps = {},
): Promise<void> {
  await deps.saveLastLarkAuthResult?.(result);
  await deps.clearPendingLarkOauthState?.(result.state);
}
