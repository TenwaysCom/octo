/**
 * Lark Authentication Controller
 *
 * Handles Lark auth code exchange and token refresh
 */

import type { LarkAuthCodeResponse, LarkAuthErrorResponse } from "./lark-auth.dto.js";
import {
  validateLarkAuthCodeRequest,
  validateLarkTokenRefreshRequest,
  validateLarkAuthStatusRequest,
} from "./lark-auth.dto.js";
import {
  exchangeLarkAuthCode,
  refreshLarkToken,
  checkLarkAuthStatus,
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
        operatorLarkId: validated.operatorLarkId,
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
        operatorLarkId: validated.operatorLarkId,
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
): Promise<ReturnType<typeof checkLarkAuthStatus>> {
  const validated = validateLarkAuthStatusRequest(request);

  return checkLarkAuthStatus({
    operatorLarkId: validated.operatorLarkId,
    baseUrl: validated.baseUrl,
  });
}
