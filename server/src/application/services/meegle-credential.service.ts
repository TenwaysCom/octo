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
  const pluginToken = await deps.authAdapter.getPluginToken(input.baseUrl);
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
}

export async function refreshCredential(
  input: MeegleTokenLookup,
  deps: MeegleCredentialServiceDeps,
): Promise<CredentialStatus> {
  const storedToken = await deps.tokenStore.get(input);

  if (!storedToken?.userToken) {
    return {
      tokenStatus: "require_auth_code",
      baseUrl: input.baseUrl,
    };
  }

  if (!isExpired(storedToken.userTokenExpiresAt)) {
    return buildReadyStatus({
      baseUrl: input.baseUrl,
      userToken: storedToken.userToken,
      refreshToken: storedToken.refreshToken,
      expiresAt: storedToken.userTokenExpiresAt,
    });
  }

  if (!storedToken.refreshToken || isExpired(storedToken.refreshTokenExpiresAt)) {
    await deps.tokenStore.delete(input);
    return {
      tokenStatus: "require_auth_code",
      baseUrl: input.baseUrl,
      errorCode: "MEEGLE_REFRESH_TOKEN_EXPIRED",
    };
  }

  let pluginToken = storedToken.pluginToken;
  let pluginTokenExpiresAt = storedToken.pluginTokenExpiresAt;

  if (!pluginToken || isExpired(pluginTokenExpiresAt)) {
    const refreshedPluginToken = await deps.authAdapter.getPluginToken(input.baseUrl);
    pluginToken = refreshedPluginToken.token;
    pluginTokenExpiresAt = toExpiresAt(refreshedPluginToken.expiresInSeconds);
  }

  let refreshed: UserTokenPair;

  try {
    refreshed = await deps.authAdapter.refreshUserToken({
      baseUrl: input.baseUrl,
      pluginToken,
      refreshToken: storedToken.refreshToken,
    });
  } catch {
    await deps.tokenStore.delete(input);
    return {
      tokenStatus: "require_auth_code",
      baseUrl: input.baseUrl,
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

  return buildReadyStatus({
    baseUrl: input.baseUrl,
    userToken: refreshed.userToken,
    refreshToken: refreshed.refreshToken ?? storedToken.refreshToken,
    expiresAt: toExpiresAt(refreshed.expiresInSeconds),
  });
}
