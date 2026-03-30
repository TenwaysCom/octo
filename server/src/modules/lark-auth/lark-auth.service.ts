/**
 * Lark Authentication Service
 *
 * Handles token exchange and refresh with Lark OpenAPI
 */

import type {
  LarkAuthCodeRequest,
  LarkTokenRefreshRequest,
  LarkTokenPair,
  LarkAuthStatusResponse,
  LarkAuthStatusRequest,
} from "./lark-auth.dto.js";
import { normalizeLarkAuthBaseUrl } from "../../platform-url.js";

export interface LarkAuthServiceDeps {
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
}

let defaultDeps: LarkAuthServiceDeps | undefined;

export function configureLarkAuthServiceDeps(deps: LarkAuthServiceDeps): void {
  defaultDeps = deps;
}

function getDeps(overrides?: Partial<LarkAuthServiceDeps>): LarkAuthServiceDeps {
  const merged = defaultDeps
    ? { ...defaultDeps, ...overrides }
    : { ...(overrides as LarkAuthServiceDeps) };

  if (!merged.appId || !merged.appSecret) {
    throw new Error("Lark app credentials not configured");
  }

  return merged as LarkAuthServiceDeps;
}

/**
 * Get app access token using app credentials
 */
async function getAppAccessToken(
  baseUrl: string,
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = new URL("/open-apis/auth/v3/app_access_token", baseUrl);

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get app access token: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;

  if (code !== 0) {
    throw new Error(`Lark API error: ${data.msg as string}`);
  }

  return data.app_access_token as string;
}

/**
 * Exchange authorization code for user access token
 */
export async function exchangeLarkAuthCode(
  request: LarkAuthCodeRequest,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkTokenPair> {
  const deps = getDeps(overrides);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authBaseUrl = normalizeLarkAuthBaseUrl(request.baseUrl);

  // First get app access token
  const appAccessToken = await getAppAccessToken(
    authBaseUrl,
    deps.appId,
    deps.appSecret,
    fetchImpl,
  );

  // Exchange user token
  const url = new URL("/open-apis/authen/v1/access_token", authBaseUrl);

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({
      grant_type: request.grantType,
      code: request.code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange auth code: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;

  if (code !== 0) {
    throw new Error(`Lark Authen API error: ${data.msg as string}`);
  }

  const tokenData = data.data as Record<string, unknown> | undefined;

  if (!tokenData) {
    throw new Error("Invalid response: missing token data");
  }

  return {
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    expiresIn: tokenData.expires_in as number | undefined,
    tokenType: tokenData.token_type as string ?? "Bearer",
  };
}

/**
 * Refresh user access token
 */
export async function refreshLarkToken(
  request: LarkTokenRefreshRequest,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkTokenPair> {
  const deps = getDeps(overrides);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authBaseUrl = normalizeLarkAuthBaseUrl(request.baseUrl);

  // First get app access token
  const appAccessToken = await getAppAccessToken(
    authBaseUrl,
    deps.appId,
    deps.appSecret,
    fetchImpl,
  );

  // Refresh user token
  const url = new URL("/open-apis/authen/v1/refresh_access_token", authBaseUrl);

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: request.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;

  if (code !== 0) {
    throw new Error(`Lark Authen API error: ${data.msg as string}`);
  }

  const tokenData = data.data as Record<string, unknown> | undefined;

  if (!tokenData) {
    throw new Error("Invalid response: missing token data");
  }

  return {
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    expiresIn: tokenData.expires_in as number | undefined,
    tokenType: tokenData.token_type as string ?? "Bearer",
  };
}

/**
 * Check auth status (simplified - just checks if token exists)
 */
export async function checkLarkAuthStatus(
  request: LarkAuthStatusRequest,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkAuthStatusResponse> {
  // In a real implementation, this would check the token store
  // For now, return require_auth since we don't have persistent storage
  return {
    status: "require_auth",
    reason: "No token store configured",
  };
}
