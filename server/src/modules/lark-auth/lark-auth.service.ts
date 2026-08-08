/**
 * Lark Authentication Service
 *
 * Handles token exchange and refresh with Lark OpenAPI
 */

import { createHash, randomBytes } from "node:crypto";
import {
  getSharedOauthSessionStore,
} from "../../adapters/postgres/lark-oauth-session-store.js";
import { getSharedLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import { getSharedWebSessionStore } from "../../adapters/postgres/web-session-store.js";
import { getSharedWebPluginLoginChallengeStore } from "../../adapters/postgres/web-plugin-login-challenge-store.js";
import type { OauthSessionStore } from "../../adapters/lark/oauth-session-store.js";
import type { LarkContactStore } from "../../adapters/lark/contact-store.js";
import type { LarkTokenStore, StoredLarkToken } from "../../adapters/lark/token-store.js";
import type { WebSessionStore } from "../../adapters/web/session-store.js";
import type { WebPluginLoginChallengeStore } from "../../adapters/web/plugin-login-challenge-store.js";
import { getLarkContactStore } from "../../adapters/postgres/lark-contact-store.js";
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
import { logger } from "../../logger.js";

// In-memory lock for preventing concurrent token refresh per user+baseUrl
const refreshLocks = new Map<string, Promise<StoredLarkToken>>();

const serviceLogger = logger.child({ module: "lark-auth-service" });

export interface LarkAuthServiceDeps {
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
  tokenStore?: LarkTokenStore;
  oauthSessionStore?: OauthSessionStore;
  webSessionStore?: WebSessionStore;
  webPluginLoginChallengeStore?: WebPluginLoginChallengeStore;
  resolvedUserStore?: ResolvedUserStore;
  contactStore?: LarkContactStore;
}

let defaultDeps: LarkAuthServiceDeps | undefined;
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WEB_PLUGIN_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
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

function getWebSessionStore(deps: LarkAuthServiceDeps): WebSessionStore {
  return deps.webSessionStore ?? getSharedWebSessionStore();
}

function getWebPluginLoginChallengeStore(deps: LarkAuthServiceDeps): WebPluginLoginChallengeStore {
  return deps.webPluginLoginChallengeStore ?? getSharedWebPluginLoginChallengeStore();
}

function getResolvedStore(deps: LarkAuthServiceDeps): ResolvedUserStore {
  return deps.resolvedUserStore ?? getResolvedUserStore();
}

function getContactStore(deps: LarkAuthServiceDeps): LarkContactStore {
  return deps.contactStore ?? getLarkContactStore();
}

function toExpiresAt(expiresInSeconds?: number): string | undefined {
  if (typeof expiresInSeconds !== "number" || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return undefined;
  }

  return new Date(Date.now() + (expiresInSeconds * 1000)).toISOString();
}

function toRefreshTokenExpiresAt(
  refreshTokenExpiresIn?: number,
  fallback?: string,
  hasNewRefreshToken?: boolean,
): string | undefined {
  // If we received a new refreshToken, always calculate from now, not from fallback
  if (hasNewRefreshToken) {
    return toExpiresAt(refreshTokenExpiresIn) ?? toExpiresAt(DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
  }
  // No new refreshToken, keep existing expiry or fallback to default
  return toExpiresAt(refreshTokenExpiresIn) ?? fallback ?? toExpiresAt(DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
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

function isInvalidAccessTokenError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /invalid access token/i.test(error.message)
  );
}

function getRefreshLockKey(masterUserId: string, baseUrl: string): string {
  return `${masterUserId}::${baseUrl}`;
}

/**
 * Refresh Lark token with concurrency control.
 * Only one refresh operation per user+baseUrl can run at a time.
 */
async function refreshLarkTokenWithLock(
  input: {
    masterUserId: string;
    stored: StoredLarkToken;
  },
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<StoredLarkToken> {
  const lockKey = getRefreshLockKey(input.masterUserId, input.stored.baseUrl);

  // If there's already a refresh in progress for this user+baseUrl, wait for it
  const existingLock = refreshLocks.get(lockKey);
  if (existingLock) {
    serviceLogger.info({
      masterUserId: input.masterUserId,
      baseUrl: input.stored.baseUrl,
    }, "LARK_TOKEN_REFRESH WAITING_LOCK");
    return existingLock;
  }

  // Create new lock promise
  const refreshPromise = refreshStoredLarkCredential(input, overrides)
    .finally(() => {
      refreshLocks.delete(lockKey);
    });

  refreshLocks.set(lockKey, refreshPromise);
  return refreshPromise;
}

export async function refreshStoredLarkCredentialWithLock(
  input: {
    masterUserId: string;
    stored: StoredLarkToken;
  },
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<StoredLarkToken> {
  return refreshLarkTokenWithLock(input, overrides);
}

async function refreshStoredLarkCredential(
  input: {
    masterUserId: string;
    stored: StoredLarkToken;
  },
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<StoredLarkToken> {
  serviceLogger.info({
    masterUserId: input.masterUserId,
    baseUrl: input.stored.baseUrl,
    larkUserId: input.stored.larkUserId,
    userTokenExpiresAt: input.stored.userTokenExpiresAt,
    refreshTokenExpiresAt: input.stored.refreshTokenExpiresAt,
  }, "LARK_TOKEN_REFRESH START");

  let refreshed: LarkTokenPair;
  try {
    refreshed = await refreshLarkToken(
      {
        masterUserId: input.masterUserId,
        baseUrl: input.stored.baseUrl,
        refreshToken: input.stored.refreshToken!,
      },
      overrides,
    );
  } catch (error) {
    serviceLogger.warn({
      masterUserId: input.masterUserId,
      baseUrl: input.stored.baseUrl,
      larkUserId: input.stored.larkUserId,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "LARK_TOKEN_REFRESH FAIL");
    throw error;
  }

  const nextToken = {
    masterUserId: input.masterUserId,
    tenantKey: input.stored.tenantKey,
    larkUserId: input.stored.larkUserId,
    baseUrl: input.stored.baseUrl,
    userToken: refreshed.accessToken,
    userTokenExpiresAt: toExpiresAt(refreshed.expiresIn),
    refreshToken: refreshed.refreshToken ?? input.stored.refreshToken,
    refreshTokenExpiresAt: toRefreshTokenExpiresAt(
      refreshed.refreshTokenExpiresIn,
      input.stored.refreshTokenExpiresAt,
      refreshed.refreshToken != null,
    ),
    credentialStatus: "active" as const,
  } satisfies StoredLarkToken;

  const deps = getDeps(overrides);
  await getTokenStore(deps).save(nextToken);
  serviceLogger.info({
    masterUserId: input.masterUserId,
    baseUrl: input.stored.baseUrl,
    larkUserId: input.stored.larkUserId,
    userTokenExpiresAt: nextToken.userTokenExpiresAt,
    refreshTokenExpiresAt: nextToken.refreshTokenExpiresAt,
    rotatedRefreshToken: refreshed.refreshToken != null,
  }, "LARK_TOKEN_REFRESH OK");
  return nextToken;
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
export async function exchangeLarkAuthorizationCode(
  request: Omit<LarkAuthCodeRequest, "masterUserId">,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkTokenPair> {
  const deps = getDeps(overrides);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authBaseUrl = normalizeLarkAuthBaseUrl(request.baseUrl);

  serviceLogger.info({
    baseUrl: authBaseUrl,
  }, "LARK_EXCHANGE_API_REQUEST");

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
    serviceLogger.warn({
      status: response.status,
      statusText: response.statusText,
    }, "LARK_EXCHANGE_API_HTTP_ERROR");
    throw new Error(`Failed to exchange auth code: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;

  if (code !== 0) {
    serviceLogger.warn({
      code,
      msg: data.msg,
      data: data.data,
    }, "LARK_EXCHANGE_API_FAIL");
    throw new Error(`Lark Authen API error: ${data.msg as string}`);
  }

  const tokenData = data.data as Record<string, unknown> | undefined;

  if (!tokenData) {
    serviceLogger.warn({ data }, "LARK_EXCHANGE_API_MISSING_DATA");
    throw new Error("Invalid response: missing token data");
  }

  const tokenPair = {
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    expiresIn: tokenData.expires_in as number | undefined,
    refreshTokenExpiresIn: tokenData.refresh_token_expires_in as number | undefined,
    tokenType: tokenData.token_type as string ?? "Bearer",
  };

  serviceLogger.info({
    hasAccessToken: Boolean(tokenPair.accessToken),
    hasRefreshToken: Boolean(tokenPair.refreshToken),
    expiresIn: tokenPair.expiresIn,
    refreshTokenExpiresIn: tokenPair.refreshTokenExpiresIn,
  }, "LARK_EXCHANGE_API_OK");

  return tokenPair;
}

export async function exchangeLarkAuthCode(
  request: LarkAuthCodeRequest,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkTokenPair> {
  const deps = getDeps(overrides);
  const authBaseUrl = normalizeLarkAuthBaseUrl(request.baseUrl);
  const tokenPair = await exchangeLarkAuthorizationCode(
    {
      baseUrl: authBaseUrl,
      code: request.code,
      grantType: request.grantType,
    },
    overrides,
  );

  const user = await getResolvedStore(deps).getById(request.masterUserId);
  if (user?.larkId) {
    const storedToken = {
      masterUserId: request.masterUserId,
      tenantKey: user.larkTenantKey ?? undefined,
      larkUserId: user.larkId,
      baseUrl: authBaseUrl,
      userToken: tokenPair.accessToken,
      userTokenExpiresAt: toExpiresAt(tokenPair.expiresIn),
      refreshToken: tokenPair.refreshToken,
      refreshTokenExpiresAt: toRefreshTokenExpiresAt(tokenPair.refreshTokenExpiresIn),
      credentialStatus: "active",
    } satisfies StoredLarkToken;
    await getTokenStore(deps).save(storedToken);
    serviceLogger.info({
      masterUserId: request.masterUserId,
      baseUrl: authBaseUrl,
      larkUserId: user.larkId,
      hasRefreshToken: Boolean(storedToken.refreshToken),
      userTokenExpiresAt: storedToken.userTokenExpiresAt,
      refreshTokenExpiresAt: storedToken.refreshTokenExpiresAt,
    }, "LARK_AUTH_CODE_EXCHANGE TOKEN_SAVED");
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

  serviceLogger.info({
    masterUserId: request.masterUserId,
    baseUrl: authBaseUrl,
  }, "LARK_REFRESH_API_REQUEST");

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
    serviceLogger.warn({
      status: response.status,
      statusText: response.statusText,
    }, "LARK_REFRESH_API_HTTP_ERROR");
    throw new Error(`Failed to refresh token: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;

  if (code !== 0) {
    serviceLogger.warn({
      code,
      msg: data.msg,
      data: data.data,
    }, "LARK_REFRESH_API_FAIL");
    throw new Error(`Lark Authen API error: ${data.msg as string}`);
  }

  const tokenData = data.data as Record<string, unknown> | undefined;

  if (!tokenData) {
    serviceLogger.warn({ data }, "LARK_REFRESH_API_MISSING_DATA");
    throw new Error("Invalid response: missing token data");
  }

  const result = {
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    expiresIn: tokenData.expires_in as number | undefined,
    refreshTokenExpiresIn: tokenData.refresh_token_expires_in as number | undefined,
    tokenType: tokenData.token_type as string ?? "Bearer",
  };

  serviceLogger.info({
    hasAccessToken: Boolean(result.accessToken),
    hasRefreshToken: Boolean(result.refreshToken),
    expiresIn: result.expiresIn,
    refreshTokenExpiresIn: result.refreshTokenExpiresIn,
  }, "LARK_REFRESH_API_OK");

  return result;
}

/**
 * Refresh Lark token by user ID and baseUrl - uses lock to prevent concurrency.
 * Fetches the stored token internally and refreshes it.
 */
export async function refreshLarkAuthStatus(
  request: { masterUserId: string; baseUrl: string },
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

  if (!stored.refreshToken || isExpired(stored.refreshTokenExpiresAt)) {
    serviceLogger.warn({
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      larkUserId: stored.larkUserId,
      refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
    }, "LARK_REFRESH REFRESH_UNAVAILABLE");
    await tokenStore.save({
      ...stored,
      credentialStatus: "expired",
    });
    return {
      status: "require_auth",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      reason: "Refresh token not available or expired",
    };
  }

  try {
    const refreshed = await refreshLarkTokenWithLock(
      {
        masterUserId: request.masterUserId,
        stored,
      },
      overrides,
    );

    return {
      status: "ready",
      masterUserId: request.masterUserId,
      baseUrl: refreshed.baseUrl,
      credentialStatus: "active",
      expiresAt: refreshed.userTokenExpiresAt,
      reason: "Lark token refreshed successfully",
    };
  } catch (error) {
    serviceLogger.warn({
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      larkUserId: stored.larkUserId,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "LARK_REFRESH FAIL");
    await tokenStore.save({
      ...stored,
      credentialStatus: "expired",
    });
    return {
      status: "require_auth",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      reason: "Token refresh failed",
    };
  }
}

/**
 * Check auth status - only checks token state, does NOT refresh.
 * Returns "require_refresh" if token is expired but refresh_token is available.
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
    serviceLogger.info({
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      larkUserId: stored.larkUserId,
      expiresAt: stored.userTokenExpiresAt,
    }, "LARK_AUTH_STATUS TOKEN_STILL_VALID");
    return {
      status: "ready",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      credentialStatus: stored.credentialStatus ?? "active",
      expiresAt: stored.userTokenExpiresAt,
      reason: "Stored Lark token is available",
    };
  }

  // Token is expired, check if refresh is possible
  if (stored.refreshToken && !isExpired(stored.refreshTokenExpiresAt)) {
    serviceLogger.info({
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      larkUserId: stored.larkUserId,
      userTokenExpiresAt: stored.userTokenExpiresAt,
      refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
    }, "LARK_AUTH_STATUS REQUIRE_REFRESH");
    return {
      status: "require_refresh",
      masterUserId: request.masterUserId,
      baseUrl: stored.baseUrl,
      credentialStatus: stored.credentialStatus ?? "active",
      expiresAt: stored.userTokenExpiresAt,
      reason: "Lark token expired, refresh available",
    };
  }

  // No refresh possible - mark as expired
  serviceLogger.warn({
    masterUserId: request.masterUserId,
    baseUrl: stored.baseUrl,
    larkUserId: stored.larkUserId,
    userTokenExpiresAt: stored.userTokenExpiresAt,
    refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
  }, "LARK_AUTH_STATUS TOKEN_EXPIRED");
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

export interface LarkWebAuthUser {
  larkName?: string;
  larkEmail?: string;
  larkAvatarUrl?: string;
}

export interface LarkWebProfile {
  user: LarkWebAuthUser;
  larkAuthorization: {
    status: "ready" | "require_auth";
    authorizedAt?: string;
    expiresAt?: string;
  };
}

export type LarkWebAuthCallbackResult =
  | { kind: "not_web" }
  | { kind: "ready"; sessionToken: string; user: LarkWebAuthUser }
  | { kind: "failed"; page: LarkAuthCallbackPage };

function hashWebSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("base64url");
}

function hashWebPluginLoginValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

async function createLarkWebSession(input: {
  masterUserId: string;
  baseUrl: string;
}, deps: LarkAuthServiceDeps): Promise<string> {
  const sessionToken = randomBytes(32).toString("base64url");
  await getWebSessionStore(deps).create({
    sessionTokenHash: hashWebSessionToken(sessionToken),
    masterUserId: input.masterUserId,
    baseUrl: input.baseUrl,
    expiresAt: new Date(Date.now() + WEB_SESSION_TTL_MS).toISOString(),
  });
  return sessionToken;
}

async function upsertLarkWebUser(
  resolvedUserStore: ResolvedUserStore,
  userInfo: { userId: string; tenantKey: string; email?: string; name?: string; avatarUrl?: string },
) {
  const existing = await resolvedUserStore.getByLarkIdentity(userInfo.tenantKey, userInfo.userId);
  if (existing) {
    return resolvedUserStore.update({
      ...existing,
      status: "active",
      larkEmail: userInfo.email ?? existing.larkEmail,
      larkName: userInfo.name ?? existing.larkName,
      larkAvatarUrl: userInfo.avatarUrl ?? existing.larkAvatarUrl,
    });
  }

  try {
    return await resolvedUserStore.create({
      status: "active",
      larkTenantKey: userInfo.tenantKey,
      larkId: userInfo.userId,
      larkEmail: userInfo.email,
      larkName: userInfo.name,
      larkAvatarUrl: userInfo.avatarUrl,
    });
  } catch (error) {
    const concurrent = await resolvedUserStore.getByLarkIdentity(userInfo.tenantKey, userInfo.userId);
    if (!concurrent) {
      throw error;
    }

    return resolvedUserStore.update({
      ...concurrent,
      status: "active",
      larkEmail: userInfo.email ?? concurrent.larkEmail,
      larkName: userInfo.name ?? concurrent.larkName,
      larkAvatarUrl: userInfo.avatarUrl ?? concurrent.larkAvatarUrl,
    });
  }
}

export async function handleLarkWebAuthCallback(
  query: LarkAuthCallbackQuery,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<LarkWebAuthCallbackResult> {
  const deps = getDeps(overrides);
  const oauthSessionStore = getOauthSessionStore(deps);
  const session = await oauthSessionStore.get(query.state);

  if (!session || session.masterUserId) {
    return { kind: "not_web" };
  }

  if (session.provider !== "lark" || session.status !== "pending" || Date.parse(session.expiresAt) <= Date.now()) {
    return {
      kind: "failed",
      page: renderCallbackPage({
        statusCode: 400,
        title: "Lark 登录失败",
        message: "登录状态已失效，请返回登录页重新发起授权。",
        state: query.state,
        status: "failed",
        reason: "LARK_OAUTH_STATE_INVALID",
      }),
    };
  }

  try {
    const tokenPair = await exchangeLarkAuthorizationCode({
      baseUrl: session.baseUrl,
      code: query.code,
      grantType: "authorization_code",
    }, overrides);
    const userInfo = await getLarkUserInfo(session.baseUrl, tokenPair.accessToken, deps.fetchImpl ?? fetch);
    const resolvedUser = await upsertLarkWebUser(getResolvedStore(deps), userInfo);
    await cacheLarkContact(deps, userInfo);

    await getTokenStore(deps).save({
      masterUserId: resolvedUser.id,
      tenantKey: userInfo.tenantKey,
      larkUserId: userInfo.userId,
      baseUrl: session.baseUrl,
      userToken: tokenPair.accessToken,
      userTokenExpiresAt: toExpiresAt(tokenPair.expiresIn),
      refreshToken: tokenPair.refreshToken,
      refreshTokenExpiresAt: toRefreshTokenExpiresAt(tokenPair.refreshTokenExpiresIn),
      credentialStatus: "active",
      lastAuthAt: new Date().toISOString(),
    });
    await oauthSessionStore.markCompleted({
      state: query.state,
      authCode: query.code,
      externalUserKey: userInfo.userId,
      masterUserId: resolvedUser.id,
    });

    const sessionToken = await createLarkWebSession({
      masterUserId: resolvedUser.id,
      baseUrl: session.baseUrl,
    }, deps);

    return {
      kind: "ready",
      sessionToken,
      user: {
        larkName: resolvedUser.larkName ?? undefined,
        larkEmail: resolvedUser.larkEmail ?? undefined,
        larkAvatarUrl: resolvedUser.larkAvatarUrl ?? undefined,
      },
    };
  } catch (error) {
    await oauthSessionStore.markFailed({
      state: query.state,
      errorCode: error instanceof Error ? error.message : "LARK_WEB_AUTH_FAILED",
    });
    serviceLogger.error({
      state: query.state,
      baseUrl: session.baseUrl,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "LARK_WEB_AUTH_CALLBACK_FAILED");
    return {
      kind: "failed",
      page: renderCallbackPage({
        statusCode: 500,
        title: "Lark 登录失败",
        message: "授权处理失败，请返回登录页重试。",
        state: query.state,
        status: "failed",
        reason: error instanceof Error ? error.message : "LARK_WEB_AUTH_FAILED",
      }),
    };
  }
}

async function resolveLarkWebSession(
  sessionToken: string | undefined,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<
  | { ok: true; masterUserId: string; baseUrl: string; user: LarkWebAuthUser }
  | { ok: false; errorCode: string; errorMessage: string }
> {
  if (!sessionToken) {
    return { ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." };
  }

  const deps = getDeps(overrides);
  const session = await getWebSessionStore(deps).get(hashWebSessionToken(sessionToken));
  if (!session || session.invalidatedAt || Date.parse(session.expiresAt) <= Date.now()) {
    return { ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Web session is invalid or expired." };
  }

  const user = await getResolvedStore(deps).getById(session.masterUserId);
  if (!user || user.status !== "active") {
    return { ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "User is unavailable." };
  }

  return {
    ok: true,
    masterUserId: session.masterUserId,
    baseUrl: session.baseUrl,
    user: {
      larkName: user.larkName ?? undefined,
      larkEmail: user.larkEmail ?? undefined,
      larkAvatarUrl: user.larkAvatarUrl ?? undefined,
    },
  };
}

export async function ensureLarkWebSession(
  sessionToken: string | undefined,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<{ ok: true; user: LarkWebAuthUser } | { ok: false; errorCode: string; errorMessage: string }> {
  const session = await resolveLarkWebSession(sessionToken, overrides);
  if (!session.ok) {
    return session;
  }

  return { ok: true, user: session.user };
}

export async function getLarkWebProfile(
  sessionToken: string | undefined,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<{ ok: true; profile: LarkWebProfile } | { ok: false; errorCode: string; errorMessage: string }> {
  const session = await resolveLarkWebSession(sessionToken, overrides);
  if (!session.ok) {
    return session;
  }

  const initialStatus = await checkLarkAuthStatus({
    masterUserId: session.masterUserId,
    baseUrl: session.baseUrl,
  }, overrides);
  const status = initialStatus.status === "require_refresh"
    ? await refreshLarkAuthStatus({ masterUserId: session.masterUserId, baseUrl: session.baseUrl }, overrides)
    : initialStatus;
  const stored = await getTokenStore(getDeps(overrides)).get({
    masterUserId: session.masterUserId,
    baseUrl: session.baseUrl,
  });

  return {
    ok: true,
    profile: {
      user: session.user,
      larkAuthorization: {
        status: status.status === "ready" ? "ready" : "require_auth",
        authorizedAt: stored?.lastAuthAt,
        expiresAt: status.status === "ready" ? status.expiresAt : undefined,
      },
    },
  };
}

export async function logoutLarkWebSession(
  sessionToken: string | undefined,
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<void> {
  if (!sessionToken) {
    return;
  }

  const deps = getDeps(overrides);
  await getWebSessionStore(deps).invalidate(hashWebSessionToken(sessionToken));
}

export async function createWebPluginLoginChallenge(
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<{ challengeId: string; browserProof: string; expiresAt: string }> {
  const deps = getDeps(overrides);
  const challengeId = randomBytes(32).toString("base64url");
  const browserProof = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + WEB_PLUGIN_LOGIN_CHALLENGE_TTL_MS).toISOString();
  await getWebPluginLoginChallengeStore(deps).create({
    challengeIdHash: hashWebPluginLoginValue(challengeId),
    browserProofHash: hashWebPluginLoginValue(browserProof),
    status: "pending",
    expiresAt,
  });
  return { challengeId, browserProof, expiresAt };
}

export async function approveWebPluginLoginChallenge(
  input: { challengeId: string; masterUserId: string },
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<{ ok: true } | { ok: false; errorCode: string; errorMessage: string }> {
  const deps = getDeps(overrides);
  const challengeIdHash = hashWebPluginLoginValue(input.challengeId);
  const now = new Date().toISOString();
  const challenge = await getWebPluginLoginChallengeStore(deps).get(challengeIdHash);
  if (!challenge || challenge.status !== "pending" || challenge.expiresAt <= now) {
    return { ok: false, errorCode: "WEB_PLUGIN_LOGIN_INVALID", errorMessage: "The plugin login challenge is invalid or expired." };
  }

  const user = await getResolvedStore(deps).getById(input.masterUserId);
  if (!user || user.status !== "active") {
    return { ok: false, errorCode: "IDENTITY_NOT_FOUND", errorMessage: "The Octo plugin identity is unavailable." };
  }

  const storedToken = await getTokenStore(deps).get({
    masterUserId: input.masterUserId,
    baseUrl: "",
  });
  if (!storedToken) {
    return { ok: false, errorCode: "LARK_AUTH_REQUIRED", errorMessage: "The Octo plugin has no Lark authorization." };
  }

  const initialStatus = await checkLarkAuthStatus({
    masterUserId: input.masterUserId,
    baseUrl: storedToken.baseUrl,
  }, deps);
  const status = initialStatus.status === "require_refresh"
    ? await refreshLarkAuthStatus({ masterUserId: input.masterUserId, baseUrl: storedToken.baseUrl }, deps)
    : initialStatus;
  if (status.status !== "ready") {
    return { ok: false, errorCode: "LARK_AUTH_REQUIRED", errorMessage: "The Octo plugin Lark authorization needs to be renewed." };
  }

  const approved = await getWebPluginLoginChallengeStore(deps).approve({
    challengeIdHash,
    masterUserId: input.masterUserId,
    baseUrl: storedToken.baseUrl,
    now,
  });
  if (!approved) {
    return { ok: false, errorCode: "WEB_PLUGIN_LOGIN_INVALID", errorMessage: "The plugin login challenge is no longer pending." };
  }

  return { ok: true };
}

export async function completeWebPluginLoginChallenge(
  input: { challengeId: string; browserProof: string | undefined },
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<{ ok: true; sessionToken: string } | { ok: false; errorCode: string; errorMessage: string }> {
  if (!input.browserProof) {
    return { ok: false, errorCode: "WEB_PLUGIN_LOGIN_INVALID", errorMessage: "Missing browser login proof." };
  }

  const deps = getDeps(overrides);
  const consumed = await getWebPluginLoginChallengeStore(deps).consume({
    challengeIdHash: hashWebPluginLoginValue(input.challengeId),
    browserProofHash: hashWebPluginLoginValue(input.browserProof),
    now: new Date().toISOString(),
  });
  if (!consumed?.masterUserId || !consumed.baseUrl) {
    return { ok: false, errorCode: "WEB_PLUGIN_LOGIN_INVALID", errorMessage: "The plugin login challenge is invalid, expired, or already consumed." };
  }

  return {
    ok: true,
    sessionToken: await createLarkWebSession({
      masterUserId: consumed.masterUserId,
      baseUrl: consumed.baseUrl,
    }, deps),
  };
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

async function getLarkContactUserInfo(
  baseUrl: string,
  userId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ email?: string; name?: string; avatarUrl?: string }> {
  const url = new URL(`/open-apis/contact/v3/users/${encodeURIComponent(userId)}`, baseUrl);
  url.searchParams.set("user_id_type", "user_id");

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    serviceLogger.warn({ status: response.status }, "Lark contact request failed");
    return {};
  }

  const data = (await response.json()) as Record<string, unknown>;
  const code = data.code as number;
  if (code !== 0) {
    serviceLogger.warn({ msg: data.msg }, "Lark contact API error");
    return {};
  }

  const contactData = (data.data as Record<string, unknown> | undefined)
    ?? (data.data as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined;
  const email = (contactData?.email as string | undefined) || undefined;
  const name = (contactData?.name as string | undefined) || undefined;
  const avatar = contactData?.avatar as Record<string, unknown> | undefined;
  const avatarUrl = (avatar?.avatar_240 as string | undefined)
    || (avatar?.avatar_640 as string | undefined)
    || (avatar?.avatar_72 as string | undefined)
    || (contactData?.avatar_url as string | undefined)
    || undefined;

  return { email, name, avatarUrl };
}

async function getLarkUserInfo(
  baseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ userId: string; tenantKey: string; email?: string; name?: string; avatarUrl?: string }> {
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
  serviceLogger.debug(data, "Lark user info raw response");
  const code = data.code as number;
  if (code !== 0) {
    throw new Error(`Lark user info API error: ${data.msg as string}`);
  }

  const userData = data.data as Record<string, unknown> | undefined;
  const userId = userData?.user_id as string | undefined;
  const tenantKey = userData?.tenant_key as string | undefined;
  const rawEmail = userData?.email as string | undefined;
  const enterpriseEmail = userData?.enterprise_email as string | undefined;
  let email = rawEmail || enterpriseEmail || undefined;
  let name = (userData?.name as string | undefined) || undefined;
  let avatarUrl = (userData?.avatar_url as string | undefined) || undefined;

  if (!userId || !tenantKey) {
    throw new Error("Lark user info response missing tenant identity");
  }

  // Fall back to Contact API when email is missing, because the current
  // OAuth scope does not always grant email access through the authen API.
  if (!email) {
    const contactInfo = await getLarkContactUserInfo(baseUrl, userId, accessToken, fetchImpl);
    email = contactInfo.email ?? email;
    name = contactInfo.name ?? name;
    avatarUrl = contactInfo.avatarUrl ?? avatarUrl;
  }

  return { userId, tenantKey, email, name, avatarUrl };
}

async function cacheLarkContact(
  deps: LarkAuthServiceDeps,
  userInfo: { userId: string; email?: string; name?: string },
): Promise<void> {
  try {
    await getContactStore(deps).upsert({
      openId: userInfo.userId,
      email: userInfo.email,
      name: userInfo.name,
    });
  } catch (error) {
    serviceLogger.warn({
      larkUserId: userInfo.userId,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "LARK_CONTACT_CACHE_FAILED");
  }
}

export async function fetchLarkUserInfo(
  request: { masterUserId: string; baseUrl: string },
  overrides?: Partial<LarkAuthServiceDeps>,
): Promise<{ userId: string; tenantKey: string; email?: string; name?: string; avatarUrl?: string }> {
  const deps = getDeps(overrides);
  const authBaseUrl = normalizeLarkAuthBaseUrl(request.baseUrl);
  const tokenStore = getTokenStore(deps);
  const stored = await tokenStore.get({
    masterUserId: request.masterUserId,
    baseUrl: authBaseUrl,
  });

  if (!stored?.userToken) {
    throw new Error("No stored Lark token found");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let currentToken = stored;

  if (
    isExpired(currentToken.userTokenExpiresAt) &&
    currentToken.refreshToken &&
    !isExpired(currentToken.refreshTokenExpiresAt)
  ) {
    serviceLogger.info({
      masterUserId: request.masterUserId,
      baseUrl: currentToken.baseUrl,
      larkUserId: currentToken.larkUserId,
      expiresAt: currentToken.userTokenExpiresAt,
    }, "LARK_USER_INFO REFRESH_BEFORE_FETCH");
    currentToken = await refreshLarkTokenWithLock(
      {
        masterUserId: request.masterUserId,
        stored: currentToken,
      },
      overrides,
    );
  }

  let userInfo;
  try {
    userInfo = await getLarkUserInfo(authBaseUrl, currentToken.userToken, fetchImpl);
  } catch (error) {
    if (
      isInvalidAccessTokenError(error) &&
      currentToken.refreshToken &&
      !isExpired(currentToken.refreshTokenExpiresAt)
    ) {
      serviceLogger.warn({
        masterUserId: request.masterUserId,
        baseUrl: currentToken.baseUrl,
        larkUserId: currentToken.larkUserId,
        errorMessage: error instanceof Error ? error.message : String(error),
      }, "LARK_USER_INFO RETRY_AFTER_REFRESH");
      currentToken = await refreshLarkTokenWithLock(
        {
          masterUserId: request.masterUserId,
          stored: currentToken,
        },
        overrides,
      );
      try {
        userInfo = await getLarkUserInfo(authBaseUrl, currentToken.userToken, fetchImpl);
      } catch (retryError) {
        serviceLogger.warn({
          masterUserId: request.masterUserId,
          baseUrl: currentToken.baseUrl,
          larkUserId: currentToken.larkUserId,
          errorMessage: retryError instanceof Error ? retryError.message : String(retryError),
        }, "LARK_USER_INFO RETRY_REFRESH_FAIL");
        throw retryError;
      }
    } else {
      throw error;
    }
  }

  const resolvedUserStore = getResolvedStore(deps);
  const existingByUser = await resolvedUserStore.getById(request.masterUserId);
  if (existingByUser) {
    await resolvedUserStore.update({
      ...existingByUser,
      larkEmail: userInfo.email ?? existingByUser.larkEmail,
      larkName: userInfo.name ?? existingByUser.larkName,
      larkAvatarUrl: userInfo.avatarUrl ?? existingByUser.larkAvatarUrl,
    });
  }
  await cacheLarkContact(deps, userInfo);

  return userInfo;
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
    serviceLogger.warn({ state: query.state, reason: "LARK_OAUTH_STATE_INVALID" }, "Lark auth callback failed");
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
    await cacheLarkContact(deps, userInfo);
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
        larkName: userInfo.name ?? existingByUser.larkName,
        larkAvatarUrl: userInfo.avatarUrl ?? existingByUser.larkAvatarUrl,
        status: "active",
      });
    }

    const storedToken = {
      masterUserId: session.masterUserId,
      tenantKey: userInfo.tenantKey,
      larkUserId: userInfo.userId,
      baseUrl: session.baseUrl,
      userToken: tokenPair.accessToken,
      userTokenExpiresAt: toExpiresAt(tokenPair.expiresIn),
      refreshToken: tokenPair.refreshToken,
      refreshTokenExpiresAt: toRefreshTokenExpiresAt(tokenPair.refreshTokenExpiresIn),
      credentialStatus: "active",
    } satisfies StoredLarkToken;
    await tokenStore.save(storedToken);
    serviceLogger.info({
      masterUserId: session.masterUserId,
      baseUrl: session.baseUrl,
      larkUserId: userInfo.userId,
      tenantKey: userInfo.tenantKey,
      hasRefreshToken: Boolean(storedToken.refreshToken),
      userTokenExpiresAt: storedToken.userTokenExpiresAt,
      refreshTokenExpiresAt: storedToken.refreshTokenExpiresAt,
    }, "LARK_AUTH_CALLBACK TOKEN_SAVED");

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
    serviceLogger.error({
      state: query.state,
      masterUserId: session.masterUserId,
      baseUrl: session.baseUrl,
      reason: error instanceof Error ? error.message : "LARK_AUTH_CALLBACK_FAILED",
      stack: error instanceof Error ? error.stack : undefined,
    }, "Lark auth callback failed");
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
