/**
 * Lark Authentication Service
 *
 * Handles token exchange and refresh with Lark OpenAPI
 */

import {
  getSharedOauthSessionStore,
} from "../../adapters/postgres/lark-oauth-session-store.js";
import { getSharedLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import type { OauthSessionStore } from "../../adapters/lark/oauth-session-store.js";
import type { LarkTokenStore } from "../../adapters/lark/token-store.js";
import { getResolvedUserStore, type ResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import type {
  LarkAuthCallbackPage,
  LarkAuthCallbackQuery,
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
  tokenStore?: LarkTokenStore;
  oauthSessionStore?: OauthSessionStore;
  resolvedUserStore?: ResolvedUserStore;
}

let defaultDeps: LarkAuthServiceDeps | undefined;
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SAFETY_WINDOW_MS = 60_000;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

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

function getTokenStore(deps: LarkAuthServiceDeps): LarkTokenStore {
  return deps.tokenStore ?? getSharedLarkTokenStore();
}

function getOauthSessionStore(deps: LarkAuthServiceDeps): OauthSessionStore {
  return deps.oauthSessionStore ?? getSharedOauthSessionStore();
}

function getResolvedStore(deps: LarkAuthServiceDeps): ResolvedUserStore {
  return deps.resolvedUserStore ?? getResolvedUserStore();
}

function toExpiresAt(expiresInSeconds?: number): string | undefined {
  if (typeof expiresInSeconds !== "number" || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return undefined;
  }

  return new Date(Date.now() + (expiresInSeconds * 1000)).toISOString();
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) {
    return true;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= Date.now() + EXPIRY_SAFETY_WINDOW_MS;
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
  const url = new URL("/open-apis/auth/v3/app_access_token/internal", baseUrl);

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

  const tokenPair = {
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    expiresIn: tokenData.expires_in as number | undefined,
    tokenType: tokenData.token_type as string ?? "Bearer",
  };

  const user = await getResolvedStore(deps).getById(request.masterUserId);
  if (user?.larkId) {
    await getTokenStore(deps).save({
      masterUserId: request.masterUserId,
      tenantKey: user.larkTenantKey ?? undefined,
      larkUserId: user.larkId,
      baseUrl: authBaseUrl,
      userToken: tokenPair.accessToken,
      userTokenExpiresAt: toExpiresAt(tokenPair.expiresIn),
      refreshToken: tokenPair.refreshToken,
      refreshTokenExpiresAt: toExpiresAt(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
      credentialStatus: "active",
    });
  }

  return tokenPair;
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
  const deps = getDeps(overrides);
  const authBaseUrl = normalizeLarkAuthBaseUrl(request.baseUrl);
  const tokenStore = getTokenStore(deps);
  const stored = await tokenStore.get({
    masterUserId: request.masterUserId,
    baseUrl: authBaseUrl,
  });

  if (!stored?.userToken) {
    return {
      status: "require_auth",
      masterUserId: request.masterUserId,
      baseUrl: authBaseUrl,
      reason: "No stored Lark token found",
    };
  }

  if (!isExpired(stored.userTokenExpiresAt)) {
    return {
      status: "ready",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      credentialStatus: stored.credentialStatus ?? "active",
      expiresAt: stored.userTokenExpiresAt,
      reason: "Stored Lark token is available",
    };
  }

  if (!stored.refreshToken || isExpired(stored.refreshTokenExpiresAt)) {
    await tokenStore.save({
      ...stored,
      credentialStatus: "expired",
    });
    return {
      status: "require_auth",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      reason: "Stored Lark token expired",
    };
  }

  try {
    const refreshed = await refreshLarkToken(
      {
        masterUserId: request.masterUserId,
        baseUrl: stored.baseUrl,
        refreshToken: stored.refreshToken,
      },
      overrides,
    );

    await tokenStore.save({
      masterUserId: request.masterUserId,
      tenantKey: stored.tenantKey,
      larkUserId: stored.larkUserId,
      baseUrl: stored.baseUrl,
      userToken: refreshed.accessToken,
      userTokenExpiresAt: toExpiresAt(refreshed.expiresIn),
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      refreshTokenExpiresAt: stored.refreshTokenExpiresAt ?? toExpiresAt(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
      credentialStatus: "active",
    });

    return {
      status: "ready",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      credentialStatus: "active",
      expiresAt: toExpiresAt(refreshed.expiresIn),
      reason: "Stored Lark token refreshed",
    };
  } catch {
    await tokenStore.save({
      ...stored,
      credentialStatus: "expired",
    });
    return {
      status: "require_auth",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      reason: "Stored Lark token expired",
    };
  }
}

export async function startLarkOauthSession(
  input: {
    state: string;
    masterUserId?: string;
    baseUrl: string;
  },
  overrides?: Partial<LarkAuthServiceDeps>,
) {
  const deps = getDeps(overrides);
  const oauthSessionStore = getOauthSessionStore(deps);
  const authBaseUrl = normalizeLarkAuthBaseUrl(input.baseUrl);

  return oauthSessionStore.save({
    state: input.state,
    provider: "lark",
    masterUserId: input.masterUserId,
    baseUrl: authBaseUrl,
    status: "pending",
    expiresAt: new Date(Date.now() + OAUTH_SESSION_TTL_MS).toISOString(),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderCallbackPage(input: {
  statusCode: number;
  title: string;
  message: string;
  state: string;
  status: "ready" | "failed";
  masterUserId?: string;
  reason?: string;
}): LarkAuthCallbackPage {
  const body = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body
    data-lark-auth-state="${escapeHtml(input.state)}"
    data-lark-auth-status="${escapeHtml(input.status)}"
    data-lark-auth-master-user-id="${escapeHtml(input.masterUserId ?? "")}"
    data-lark-auth-reason="${escapeHtml(input.reason ?? "")}"
  >
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.message)}</p>
    </main>
  </body>
</html>`;

  return {
    statusCode: input.statusCode,
    contentType: "text/html; charset=utf-8",
    body,
  };
}

async function getLarkUserInfo(
  baseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ userId: string; tenantKey: string; email?: string }> {
  const url = new URL("/open-apis/authen/v1/user_info", baseUrl);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Lark user info: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;
  if (code !== 0) {
    throw new Error(`Lark user info API error: ${data.msg as string}`);
  }

  const userData = data.data as Record<string, unknown> | undefined;
  const userId = userData?.user_id as string | undefined;
  const tenantKey = userData?.tenant_key as string | undefined;
  const email = userData?.email as string | undefined;
  if (!userId || !tenantKey) {
    throw new Error("Lark user info response missing tenant identity");
  }

  return { userId, tenantKey, email };
}

export async function handleLarkAuthCallback(
  query: LarkAuthCallbackQuery,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkAuthCallbackPage> {
  const deps = getDeps(overrides);
  const oauthSessionStore = getOauthSessionStore(deps);
  const tokenStore = getTokenStore(deps);
  const resolvedUserStore = getResolvedStore(deps);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const session = await oauthSessionStore.get(query.state);

  if (!session || session.provider !== "lark" || session.status !== "pending" || Date.parse(session.expiresAt) <= Date.now()) {
    console.warn("[LARK_AUTH_CALLBACK][FAIL]", {
      state: query.state,
      reason: "LARK_OAUTH_STATE_INVALID",
    });
    return renderCallbackPage({
      statusCode: 400,
      title: "Lark 授权失败",
      message: "state 校验失败，请回到插件重新发起授权。",
      state: query.state,
      status: "failed",
      reason: "LARK_OAUTH_STATE_INVALID",
    });
  }

  try {
    if (!session.masterUserId) {
      throw new Error("Missing masterUserId in OAuth session");
    }

    const tokenPair = await exchangeLarkAuthCode(
      {
        masterUserId: session.masterUserId,
        baseUrl: session.baseUrl,
        code: query.code,
        grantType: "authorization_code",
      },
      overrides,
    );
    const userInfo = await getLarkUserInfo(session.baseUrl, tokenPair.accessToken, fetchImpl);
    const existingByUser = await resolvedUserStore.getById(session.masterUserId);
    const existingByLarkIdentity = await resolvedUserStore.getByLarkIdentity(
      userInfo.tenantKey,
      userInfo.userId,
    );

    if (existingByLarkIdentity && existingByLarkIdentity.id !== session.masterUserId) {
      await oauthSessionStore.markFailed({
        state: query.state,
        errorCode: "LARK_IDENTITY_CONFLICT",
      });
      return renderCallbackPage({
        statusCode: 409,
        title: "Lark 授权失败",
        message: "当前 Lark 身份已绑定到其他用户，请联系维护者处理。",
        state: query.state,
        status: "failed",
        masterUserId: existingByLarkIdentity.id,
        reason: "LARK_IDENTITY_CONFLICT",
      });
    }

    if (existingByUser) {
      await resolvedUserStore.update({
        ...existingByUser,
        larkTenantKey: userInfo.tenantKey,
        larkId: userInfo.userId,
        larkEmail: userInfo.email ?? existingByUser.larkEmail,
        status: "active",
      });
    }

    await tokenStore.save({
      masterUserId: session.masterUserId,
      tenantKey: userInfo.tenantKey,
      larkUserId: userInfo.userId,
      baseUrl: session.baseUrl,
      userToken: tokenPair.accessToken,
      userTokenExpiresAt: toExpiresAt(tokenPair.expiresIn),
      refreshToken: tokenPair.refreshToken,
      refreshTokenExpiresAt: toExpiresAt(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
      credentialStatus: "active",
    });

    await oauthSessionStore.markCompleted({
      state: query.state,
      authCode: query.code,
      externalUserKey: userInfo.userId,
      masterUserId: session.masterUserId,
    });

    return renderCallbackPage({
      statusCode: 200,
      title: "Lark 授权完成",
      message: "授权完成，现在可以回到插件继续。",
      state: query.state,
      status: "ready",
      masterUserId: session.masterUserId,
    });
  } catch (error) {
    console.error("[LARK_AUTH_CALLBACK][FAIL]", {
      state: query.state,
      masterUserId: session.masterUserId,
      baseUrl: session.baseUrl,
      reason: error instanceof Error ? error.message : "LARK_AUTH_CALLBACK_FAILED",
      stack: error instanceof Error ? error.stack : undefined,
    });
    await oauthSessionStore.markFailed({
      state: query.state,
      errorCode: error instanceof Error ? error.message : "LARK_AUTH_CALLBACK_FAILED",
    });
    return renderCallbackPage({
      statusCode: 500,
      title: "Lark 授权失败",
      message: "授权处理失败，请回到插件重试。",
      state: query.state,
      status: "failed",
      masterUserId: session.masterUserId,
      reason: error instanceof Error ? error.message : "LARK_AUTH_CALLBACK_FAILED",
    });
  }
}

export async function getLarkOauthSession(
  state: string,
  overrides?: Partial<LarkAuthServiceDeps>,
) {
  const deps = getDeps(overrides);
  return getOauthSessionStore(deps).get(state);
}

export async function saveLarkToken(
  input: Parameters<LarkTokenStore["save"]>[0],
  overrides?: Partial<LarkAuthServiceDeps>,
) {
  const deps = getDeps(overrides);
  await getTokenStore(deps).save(input);

  return {
    ok: true as const,
  };
}
