import type {
  MeegleAuthAdapter,
  UserTokenPair,
} from "../../adapters/meegle/auth-adapter.js";
import type {
  MeegleTokenLookup,
  MeegleTokenStore,
  StoredMeegleToken,
} from "../../adapters/meegle/token-store.js";

export interface CredentialExchangeInput extends MeegleTokenLookup {
  requestId: string;
  authCode: string;
  state?: string;
}

export interface CredentialStatus {
  requestId?: string;
  tokenStatus: "ready" | "require_auth_code";
  credentialStatus?: "active" | "expired";
  baseUrl: string;
  userToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  errorCode?: string;
}

export interface MeegleCredentialServiceDeps {
  authAdapter: MeegleAuthAdapter;
  tokenStore: MeegleTokenStore;
}

const EXPIRY_SAFETY_WINDOW_MS = 60_000;
const SERVER_CREDENTIAL_FLOW_PREFIX = "[MEEGLE_AUTH_FLOW][SERVER][CREDENTIAL]";

function logCredentialFlow(node: string, phase: "START" | "OK" | "FAIL", detail: Record<string, unknown>): void {
  const logger = phase === "FAIL" ? console.error : console.log;
  logger(`${SERVER_CREDENTIAL_FLOW_PREFIX}[${node}][${phase}]`, detail);
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

function buildReadyStatus(input: {
  requestId?: string;
  baseUrl: string;
  userToken: string;
  refreshToken?: string;
  expiresAt?: string;
}): CredentialStatus {
  return {
    requestId: input.requestId,
    tokenStatus: "ready",
    credentialStatus: "active",
    baseUrl: input.baseUrl,
    userToken: input.userToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
  };
}

export async function exchangeCredential(
  input: CredentialExchangeInput,
  deps: MeegleCredentialServiceDeps,
): Promise<CredentialStatus> {
  let stage = "get_plugin_token";

  logCredentialFlow("EXCHANGE", "START", { requestId: input.requestId, operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: input.baseUrl, hasAuthCode: Boolean(input.authCode) });

  try {
    const pluginToken = await deps.authAdapter.getPluginToken(input.baseUrl);
    stage = "exchange_user_token";
    const tokenPair: UserTokenPair = await deps.authAdapter.exchangeUserToken({
      baseUrl: input.baseUrl,
      pluginToken: pluginToken.token,
      authCode: input.authCode,
      state: input.state,
    });

    const storedToken: StoredMeegleToken = {
      operatorLarkId: input.operatorLarkId,
      meegleUserKey: input.meegleUserKey,
      baseUrl: input.baseUrl,
      pluginToken: pluginToken.token,
      pluginTokenExpiresAt: toExpiresAt(pluginToken.expiresInSeconds),
      userToken: tokenPair.userToken,
      userTokenExpiresAt: toExpiresAt(tokenPair.expiresInSeconds),
      refreshToken: tokenPair.refreshToken,
      refreshTokenExpiresAt: toExpiresAt(tokenPair.refreshTokenExpiresInSeconds),
      credentialStatus: "active",
    };

    await deps.tokenStore.save(storedToken);

    logCredentialFlow("EXCHANGE", "OK", { requestId: input.requestId, operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: input.baseUrl, stage: "stored_token", hasRefreshToken: Boolean(tokenPair.refreshToken), expiresAt: storedToken.userTokenExpiresAt });

    console.log(
      "[Tenways Octo] Meegle token exchange ready:",
      {
        operatorLarkId: input.operatorLarkId,
        meegleUserKey: input.meegleUserKey,
        baseUrl: input.baseUrl,
        requestId: input.requestId,
      },
    );

    return buildReadyStatus({
      requestId: input.requestId,
      baseUrl: input.baseUrl,
      userToken: tokenPair.userToken,
      refreshToken: tokenPair.refreshToken,
      expiresAt: storedToken.userTokenExpiresAt,
    });
  } catch (error) {
    console.error("[Tenways Octo] Meegle credential exchange failed:", {
      requestId: input.requestId,
      operatorLarkId: input.operatorLarkId,
      meegleUserKey: input.meegleUserKey,
      baseUrl: input.baseUrl,
      stage,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function refreshCredential(
  input: MeegleTokenLookup,
  deps: MeegleCredentialServiceDeps,
): Promise<CredentialStatus> {
  logCredentialFlow("REFRESH", "START", { operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: input.baseUrl });
  const storedToken = await deps.tokenStore.get(input);

  if (!storedToken?.userToken) {
    logCredentialFlow("REFRESH", "FAIL", { operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: input.baseUrl, reason: "NO_STORED_USER_TOKEN" });
    return {
      tokenStatus: "require_auth_code",
      baseUrl: input.baseUrl,
    };
  }

  const effectiveBaseUrl = storedToken.baseUrl;

  if (!isExpired(storedToken.userTokenExpiresAt)) {
    logCredentialFlow("REFRESH", "OK", { operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: effectiveBaseUrl, requestedBaseUrl: input.baseUrl, source: "cached_user_token", expiresAt: storedToken.userTokenExpiresAt });
    return buildReadyStatus({
      baseUrl: effectiveBaseUrl,
      userToken: storedToken.userToken,
      refreshToken: storedToken.refreshToken,
      expiresAt: storedToken.userTokenExpiresAt,
    });
  }

  if (!storedToken.refreshToken || isExpired(storedToken.refreshTokenExpiresAt)) {
    console.warn("[Tenways Octo] Meegle refresh token unavailable or expired:", {
      operatorLarkId: input.operatorLarkId,
      meegleUserKey: input.meegleUserKey,
      baseUrl: effectiveBaseUrl,
      requestedBaseUrl: input.baseUrl,
      hasRefreshToken: Boolean(storedToken.refreshToken),
      refreshTokenExpiresAt: storedToken.refreshTokenExpiresAt,
    });
    await deps.tokenStore.delete({
      operatorLarkId: storedToken.operatorLarkId,
      meegleUserKey: storedToken.meegleUserKey,
      baseUrl: storedToken.baseUrl,
    });
    return {
      tokenStatus: "require_auth_code",
      baseUrl: effectiveBaseUrl,
      errorCode: "MEEGLE_REFRESH_TOKEN_EXPIRED",
    };
  }

  let pluginToken = storedToken.pluginToken;
  let pluginTokenExpiresAt = storedToken.pluginTokenExpiresAt;

  if (!pluginToken || isExpired(pluginTokenExpiresAt)) {
    logCredentialFlow("REFRESH", "START", { operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: effectiveBaseUrl, requestedBaseUrl: input.baseUrl, source: "refresh_plugin_token" });
    const refreshedPluginToken = await deps.authAdapter.getPluginToken(effectiveBaseUrl);
    pluginToken = refreshedPluginToken.token;
    pluginTokenExpiresAt = toExpiresAt(refreshedPluginToken.expiresInSeconds);
  }

  let refreshed: UserTokenPair;

  try {
    refreshed = await deps.authAdapter.refreshUserToken({
      baseUrl: effectiveBaseUrl,
      pluginToken,
      refreshToken: storedToken.refreshToken,
    });
  } catch {
    console.error("[Tenways Octo] Meegle token refresh failed:", {
      operatorLarkId: input.operatorLarkId,
      meegleUserKey: input.meegleUserKey,
      baseUrl: effectiveBaseUrl,
      requestedBaseUrl: input.baseUrl,
    });
    await deps.tokenStore.delete({
      operatorLarkId: storedToken.operatorLarkId,
      meegleUserKey: storedToken.meegleUserKey,
      baseUrl: storedToken.baseUrl,
    });
    return {
      tokenStatus: "require_auth_code",
      baseUrl: effectiveBaseUrl,
      errorCode: "MEEGLE_TOKEN_REFRESH_FAILED",
    };
  }

  await deps.tokenStore.save({
    ...storedToken,
    pluginToken,
    pluginTokenExpiresAt,
    userToken: refreshed.userToken,
    userTokenExpiresAt: toExpiresAt(refreshed.expiresInSeconds),
    refreshToken: refreshed.refreshToken ?? storedToken.refreshToken,
    refreshTokenExpiresAt:
      toExpiresAt(refreshed.refreshTokenExpiresInSeconds) ?? storedToken.refreshTokenExpiresAt,
    credentialStatus: "active",
  });

  logCredentialFlow("REFRESH", "OK", { operatorLarkId: input.operatorLarkId, meegleUserKey: input.meegleUserKey, baseUrl: effectiveBaseUrl, requestedBaseUrl: input.baseUrl, source: "refresh_token", expiresAt: toExpiresAt(refreshed.expiresInSeconds), hasRefreshToken: Boolean(refreshed.refreshToken ?? storedToken.refreshToken) });

  return buildReadyStatus({
    baseUrl: effectiveBaseUrl,
    userToken: refreshed.userToken,
    refreshToken: refreshed.refreshToken ?? storedToken.refreshToken,
    expiresAt: toExpiresAt(refreshed.expiresInSeconds),
  });
}
