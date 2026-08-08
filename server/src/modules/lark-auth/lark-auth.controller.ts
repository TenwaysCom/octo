/**
 * Lark Authentication Controller
 *
 * Handles Lark auth code exchange and token refresh
 */

import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import type { LarkAuthCodeResponse, LarkAuthErrorResponse } from "./lark-auth.dto.js";
import {
  validateLarkAuthCallbackQuery,
  validateLarkAuthCodeRequest,
  validateLarkOauthSessionRequest,
  validateLarkTokenRefreshRequest,
  validateLarkAuthStatusRequest,
  validateLarkUserInfoRequest,
  validateWebPluginLoginApprovalRequest,
  validateWebPluginLoginCompletionRequest,
} from "./lark-auth.dto.js";
import {
  exchangeLarkAuthCode,
  handleLarkAuthCallback,
  refreshLarkToken,
  checkLarkAuthStatus,
  startLarkOauthSession,
  fetchLarkUserInfo,
  refreshLarkAuthStatus,
  ensureLarkWebSession,
  getLarkWebProfile,
  handleLarkWebAuthCallback,
  logoutLarkWebSession,
  approveWebPluginLoginChallenge,
  completeWebPluginLoginChallenge,
  createWebPluginLoginChallenge,
} from "./lark-auth.service.js";

export interface LarkAuthControllerDeps {
  appId: string;
  appSecret: string;
  oauthCallbackUrl?: string;
  webAppUrl?: string;
  oauthBaseUrl?: string;
  oauthScope?: string;
}

export const WEB_SESSION_COOKIE_NAME = "octo_web_session";
export const WEB_PLUGIN_LOGIN_COOKIE_NAME = "octo_web_plugin_login";
const DEFAULT_OAUTH_BASE_URL = "https://open.larksuite.com";
const DEFAULT_OAUTH_SCOPE = "offline_access contact:user.base:readonly bitable:app base:record:retrieve im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message";

let defaultDeps: LarkAuthControllerDeps | undefined;

export function configureLarkAuthControllerDeps(deps: LarkAuthControllerDeps): void {
  defaultDeps = deps;
}

function getDeps(): LarkAuthControllerDeps {
  if (!defaultDeps?.appId || !defaultDeps?.appSecret) {
    throw new Error("Lark controller credentials not configured");
  }
  return defaultDeps;
}

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST",
      errorMessage: error.message,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toInvalidCallbackPage(error: ZodError) {
  return {
    statusCode: 400,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lark 授权失败</title>
  </head>
  <body
    data-lark-auth-state=""
    data-lark-auth-status="failed"
    data-lark-auth-master-user-id=""
    data-lark-auth-reason="INVALID_REQUEST"
  >
    <main>
      <h1>Lark 授权失败</h1>
      <p>${escapeHtml(error.message)}</p>
    </main>
  </body>
</html>`,
  };
}

/**
 * Exchange Lark auth code for user access token
 */
export async function exchangeAuthCodeController(
  request: unknown,
): Promise<LarkAuthCodeResponse | LarkAuthErrorResponse> {
  try {
    const validated = validateLarkAuthCodeRequest(request);
    const deps = getDeps();

    const tokenPair = await exchangeLarkAuthCode(
      {
        masterUserId: validated.masterUserId,
        baseUrl: validated.baseUrl,
        code: validated.code,
        grantType: validated.grantType,
      },
      {
        appId: deps.appId,
        appSecret: deps.appSecret,
      },
    );

    return {
      ok: true,
      data: tokenPair,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false,
      error: {
        errorCode: "LARK_AUTH_EXCHANGE_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Refresh Lark user access token
 */
export async function refreshTokenController(
  request: unknown,
): Promise<LarkAuthCodeResponse | LarkAuthErrorResponse> {
  try {
    const validated = validateLarkTokenRefreshRequest(request);
    const deps = getDeps();

    const tokenPair = await refreshLarkToken(
      {
        masterUserId: validated.masterUserId,
        baseUrl: validated.baseUrl,
        refreshToken: validated.refreshToken,
      },
      {
        appId: deps.appId,
        appSecret: deps.appSecret,
      },
    );

    return {
      ok: true,
      data: tokenPair,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false,
      error: {
        errorCode: "LARK_TOKEN_REFRESH_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Check Lark auth status
 */
export async function getAuthStatusController(
  request: unknown,
): Promise<{
  ok: true;
  data: Awaited<ReturnType<typeof checkLarkAuthStatus>>;
} | LarkAuthErrorResponse> {
  try {
    const validated = validateLarkAuthStatusRequest(request);
    return {
      ok: true,
      data: await checkLarkAuthStatus({
        masterUserId: validated.masterUserId,
        baseUrl: validated.baseUrl,
      }),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    throw error;
  }
}

export async function handleAuthCallbackController(
  request: { query: unknown },
) {
  try {
    const validated = validateLarkAuthCallbackQuery(request.query);
    const webResult = await handleLarkWebAuthCallback(validated);
    if (webResult.kind === "ready") {
      const webAppUrl = new URL(getDeps().webAppUrl || "http://localhost:4173");
      return {
        statusCode: 302,
        contentType: "text/plain; charset=utf-8",
        body: "Redirecting to Tenways Octo.",
        redirectUrl: webAppUrl.toString(),
        webSessionToken: webResult.sessionToken,
      };
    }
    if (webResult.kind === "failed") {
      return webResult.page;
    }
    return handleLarkAuthCallback(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidCallbackPage(error);
    }

    throw error;
  }
}

function buildLarkOauthUrl(input: {
  appId: string;
  callbackUrl: string;
  baseUrl: string;
  state: string;
  scope: string;
}): string {
  const authorizeBaseUrl = input.baseUrl.includes("feishu.cn")
    ? "https://accounts.feishu.cn"
    : "https://accounts.larksuite.com";
  const oauthUrl = new URL("/open-apis/authen/v1/authorize", authorizeBaseUrl);
  oauthUrl.searchParams.set("app_id", input.appId);
  oauthUrl.searchParams.set("redirect_uri", input.callbackUrl);
  oauthUrl.searchParams.set("state", input.state);
  oauthUrl.searchParams.set("scope", input.scope);
  oauthUrl.searchParams.set("response_type", "code");
  return oauthUrl.toString();
}

export async function startWebLarkAuthController(): Promise<{ redirectUrl: string }> {
  const deps = getDeps();
  const callbackUrl = deps.oauthCallbackUrl || "http://localhost:3000/api/lark/auth/callback";
  const baseUrl = deps.oauthBaseUrl || DEFAULT_OAUTH_BASE_URL;
  const state = randomBytes(32).toString("base64url");

  await startLarkOauthSession({ state, baseUrl });
  return {
    redirectUrl: buildLarkOauthUrl({
      appId: deps.appId,
      callbackUrl,
      baseUrl,
      state,
      scope: deps.oauthScope || DEFAULT_OAUTH_SCOPE,
    }),
  };
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${name}=`;
  const part = cookieHeader.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!part) {
    return undefined;
  }

  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export async function ensureWebLarkAuthController(cookieHeader: string | undefined) {
  const result = await ensureLarkWebSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
  if (!result.ok) {
    return {
      statusCode: 401,
      body: {
        ok: false as const,
        error: {
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      ok: true as const,
      data: { user: result.user },
    },
  };
}

export async function getWebProfileController(cookieHeader: string | undefined) {
  const result = await getLarkWebProfile(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
  if (!result.ok) {
    return {
      statusCode: 401,
      body: {
        ok: false as const,
        error: {
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      ok: true as const,
      data: result.profile,
    },
  };
}

export async function logoutWebLarkAuthController(cookieHeader: string | undefined) {
  await logoutLarkWebSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
  return {
    ok: true as const,
    data: { loggedOut: true },
  };
}

export async function startWebPluginLoginController() {
  const challenge = await createWebPluginLoginChallenge();
  return {
    statusCode: 200,
    browserProof: challenge.browserProof,
    body: {
      ok: true as const,
      data: {
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
      },
    },
  };
}

export async function approveWebPluginLoginController(request: unknown) {
  try {
    const validated = validateWebPluginLoginApprovalRequest(request);
    const result = await approveWebPluginLoginChallenge(validated);
    if (!result.ok) {
      return {
        statusCode: 409,
        body: {
          ok: false as const,
          error: {
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        },
      };
    }

    return {
      statusCode: 200,
      body: { ok: true as const, data: { approved: true } },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return { statusCode: 400, body: toInvalidRequest(error) };
    }
    throw error;
  }
}

export async function completeWebPluginLoginController(input: {
  request: unknown;
  cookieHeader: string | undefined;
}) {
  try {
    const validated = validateWebPluginLoginCompletionRequest(input.request);
    const result = await completeWebPluginLoginChallenge({
      challengeId: validated.challengeId,
      browserProof: readCookie(input.cookieHeader, WEB_PLUGIN_LOGIN_COOKIE_NAME),
    });
    if (!result.ok) {
      return {
        statusCode: 401,
        body: {
          ok: false as const,
          error: {
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        },
      };
    }

    return {
      statusCode: 200,
      webSessionToken: result.sessionToken,
      body: { ok: true as const, data: { loggedIn: true } },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return { statusCode: 400, body: toInvalidRequest(error) };
    }
    throw error;
  }
}

export async function createOauthSessionController(request: unknown) {
  try {
    const validated = validateLarkOauthSessionRequest(request);
    return {
      ok: true as const,
      data: await startLarkOauthSession({
        state: validated.state,
        masterUserId: validated.masterUserId,
        baseUrl: validated.baseUrl,
      }),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    throw error;
  }
}

export async function getLarkUserInfoController(
  request: unknown,
): Promise<
  | {
      ok: true;
      data: {
        userId: string;
        tenantKey: string;
        email?: string;
        name?: string;
        avatarUrl?: string;
      };
    }
  | LarkAuthErrorResponse
> {
  try {
    const validated = validateLarkUserInfoRequest(request);
    const deps = getDeps();

    const userInfo = await fetchLarkUserInfo(
      {
        masterUserId: validated.masterUserId,
        baseUrl: validated.baseUrl,
      },
      {
        appId: deps.appId,
        appSecret: deps.appSecret,
      },
    );

    return {
      ok: true,
      data: userInfo,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false,
      error: {
        errorCode: "LARK_USER_INFO_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Refresh Lark token with lock - for plugin-side ensureLarkAuth
 */
export async function refreshLarkAuthStatusController(
  request: unknown,
): Promise<
  | {
      ok: true;
      data: Awaited<ReturnType<typeof refreshLarkAuthStatus>>;
    }
  | LarkAuthErrorResponse
> {
  try {
    const validated = validateLarkAuthStatusRequest(request);
    const deps = getDeps();

    const result = await refreshLarkAuthStatus(
      {
        masterUserId: validated.masterUserId,
        baseUrl: validated.baseUrl,
      },
      {
        appId: deps.appId,
        appSecret: deps.appSecret,
      },
    );

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false,
      error: {
        errorCode: "LARK_TOKEN_REFRESH_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
