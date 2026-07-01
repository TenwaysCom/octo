/**
 * Lark Authentication Controller
 *
 * Handles Lark auth code exchange and token refresh
 */

import { ZodError } from "zod";
import type { LarkAuthCodeResponse, LarkAuthErrorResponse } from "./lark-auth.dto.js";
import {
  validateLarkAuthCallbackQuery,
  validateLarkAuthCodeRequest,
  validateLarkOauthSessionRequest,
  validateLarkTokenRefreshRequest,
  validateLarkAuthStatusRequest,
  validateLarkUserInfoRequest,
} from "./lark-auth.dto.js";
import {
  exchangeLarkAuthCode,
  handleLarkAuthCallback,
  refreshLarkToken,
  checkLarkAuthStatus,
  startLarkOauthSession,
  fetchLarkUserInfo,
  refreshLarkAuthStatus,
} from "./lark-auth.service.js";

export interface LarkAuthControllerDeps {
  appId: string;
  appSecret: string;
}

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
    return handleLarkAuthCallback(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidCallbackPage(error);
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
