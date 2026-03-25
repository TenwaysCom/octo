/**
 * Extension storage - wraps chrome.storage API
 */

export interface AuthState {
  pluginId?: string;
  authCode?: string;
  authCodeState?: string;
  authCodeIssuedAt?: string;
  userToken?: string;
  userTokenExpiresAt?: string;
  refreshToken?: string;
  // Lark auth
  larkAuthCode?: string;
  larkAuthCodeState?: string;
  larkAuthCodeIssuedAt?: string;
  larkUserToken?: string;
  larkUserTokenExpiresAt?: string;
  larkRefreshToken?: string;
}

const STORAGE_KEY = "itpm_assistant_auth";

/**
 * Get auth state from storage
 */
export async function getAuthState(): Promise<AuthState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve((result[STORAGE_KEY] as AuthState) || {});
    });
  });
}

/**
 * Save auth state to storage
 */
export async function saveAuthState(state: AuthState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
  });
}

/**
 * Get cached plugin ID
 */
export async function getCachedPluginId(): Promise<string | undefined> {
  const state = await getAuthState();
  return state.pluginId;
}

/**
 * Save plugin ID to storage
 */
export async function savePluginId(pluginId: string): Promise<void> {
  const state = await getAuthState();
  await saveAuthState({ ...state, pluginId });
}

/**
 * Get cached user token
 */
export async function getCachedUserToken(): Promise<string | undefined> {
  const state = await getAuthState();

  if (!state.userToken) {
    return undefined;
  }

  // Check if token is expired
  if (state.userTokenExpiresAt) {
    const expiresAt = new Date(state.userTokenExpiresAt).getTime();
    if (Date.now() > expiresAt) {
      console.log("[Tenways Octo] User token expired");
      return undefined;
    }
  }

  return state.userToken;
}

/**
 * Save user token to storage
 */
export async function saveUserToken(
  userToken: string,
  refreshToken?: string,
  expiresInSeconds?: number,
): Promise<void> {
  const state = await getAuthState();
  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : undefined;

  await saveAuthState({
    ...state,
    userToken,
    refreshToken,
    userTokenExpiresAt: expiresAt,
  });
}

/**
 * Save auth code response
 */
export async function saveAuthCodeResponse(
  authCode: string,
  state: string,
  issuedAt: string,
): Promise<void> {
  const current = await getAuthState();
  await saveAuthState({
    ...current,
    authCode,
    authCodeState: state,
    authCodeIssuedAt: issuedAt,
  });
}

/**
 * Clear auth state
 */
export async function clearAuthState(): Promise<void> {
  await saveAuthState({});
}

// ==================== Lark Auth Storage ====================

/**
 * Get cached Lark user token
 */
export async function getCachedLarkUserToken(): Promise<string | undefined> {
  const state = await getAuthState();

  if (!state.larkUserToken) {
    return undefined;
  }

  // Check if token is expired
  if (state.larkUserTokenExpiresAt) {
    const expiresAt = new Date(state.larkUserTokenExpiresAt).getTime();
    if (Date.now() > expiresAt) {
      console.log("[Tenways Octo] Lark user token expired");
      return undefined;
    }
  }

  return state.larkUserToken;
}

/**
 * Save Lark user token to storage
 */
export async function saveLarkUserToken(
  userToken: string,
  refreshToken?: string,
  expiresInSeconds?: number,
): Promise<void> {
  const state = await getAuthState();
  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : undefined;

  await saveAuthState({
    ...state,
    larkUserToken: userToken,
    larkRefreshToken: refreshToken,
    larkUserTokenExpiresAt: expiresAt,
  });
}

/**
 * Save Lark auth code response
 */
export async function saveLarkAuthCodeResponse(
  authCode: string,
  state: string,
  issuedAt: string,
): Promise<void> {
  const current = await getAuthState();
  await saveAuthState({
    ...current,
    larkAuthCode: authCode,
    larkAuthCodeState: state,
    larkAuthCodeIssuedAt: issuedAt,
  });
}

/**
 * Clear Lark auth state
 */
export async function clearLarkAuthState(): Promise<void> {
  const state = await getAuthState();
  await saveAuthState({
    ...state,
    larkAuthCode: undefined,
    larkAuthCodeState: undefined,
    larkAuthCodeIssuedAt: undefined,
    larkUserToken: undefined,
    larkUserTokenExpiresAt: undefined,
    larkRefreshToken: undefined,
  });
}
