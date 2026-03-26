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
  baseUrl: string;
  userToken?: string;
  refreshToken?: string;
  errorCode?: string;
}

export interface MeegleCredentialServiceDeps {
  authAdapter: MeegleAuthAdapter;
  tokenStore: MeegleTokenStore;
}

export async function exchangeCredential(
  input: CredentialExchangeInput,
  deps: MeegleCredentialServiceDeps,
): Promise<CredentialStatus> {
  const pluginToken = await deps.authAdapter.getPluginToken(input.baseUrl);
  const tokenPair: UserTokenPair = await deps.authAdapter.exchangeUserToken({
    baseUrl: input.baseUrl,
    pluginToken,
    authCode: input.authCode,
    state: input.state,
  });

  const storedToken: StoredMeegleToken = {
    operatorLarkId: input.operatorLarkId,
    meegleUserKey: input.meegleUserKey,
    baseUrl: input.baseUrl,
    pluginToken,
    userToken: tokenPair.userToken,
    refreshToken: tokenPair.refreshToken,
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

  return {
    requestId: input.requestId,
    tokenStatus: "ready",
    baseUrl: input.baseUrl,
    userToken: tokenPair.userToken,
    refreshToken: tokenPair.refreshToken,
  };
}

export async function refreshCredential(
  input: MeegleTokenLookup,
  deps: MeegleCredentialServiceDeps,
): Promise<CredentialStatus> {
  const storedToken = await deps.tokenStore.get(input);

  if (!storedToken?.refreshToken) {
    return {
      tokenStatus: "require_auth_code",
      baseUrl: input.baseUrl,
    };
  }

  const pluginToken =
    storedToken.pluginToken || (await deps.authAdapter.getPluginToken(input.baseUrl));
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
    userToken: refreshed.userToken,
    refreshToken: refreshed.refreshToken,
  });

  return {
    tokenStatus: "ready",
    baseUrl: input.baseUrl,
    userToken: refreshed.userToken,
    refreshToken: refreshed.refreshToken,
  };
}
