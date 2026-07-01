/**
 * Extension storage - wraps chrome.storage API
 */

import { createExtensionLogger } from "../logger.js";
import type { KimiChatTranscriptEntry } from "../types/acp-kimi.js";
import type { UpdateState } from "../types/update.js";

const storageLogger = createExtensionLogger("background:storage");

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
  pendingLarkOauthState?: string;
  pendingLarkOauthStartedAt?: string;
  pendingLarkOauthBaseUrl?: string;
  pendingLarkOauthMasterUserId?: string;
  lastLarkAuthResult?: {
    state: string;
    status: "ready" | "failed";
    masterUserId?: string;
    reason?: string;
  };
}

const STORAGE_KEY = "itpm_assistant_auth";
const RESOLVED_IDENTITY_STORAGE_KEY = "masterUserId";
const RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY = "resolvedIdentityByTab";
const KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY = "kimiChatTranscriptSnapshots";
const UPDATE_STATE_STORAGE_KEY = "itpm_update_state";

type ResolvedIdentityByTabState = Record<string, string>;
type KimiChatTranscriptSnapshotsState = Record<string, KimiChatTranscriptSnapshot>;

export interface KimiChatTranscriptSnapshot {
  operatorLarkId: string;
  sessionId: string;
  transcript: KimiChatTranscriptEntry[];
  updatedAt: string;
}

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
 * Get resolved master user ID from local storage
 */
export async function getStoredMasterUserId(): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get([RESOLVED_IDENTITY_STORAGE_KEY], (result) => {
      resolve(
        (result as { [RESOLVED_IDENTITY_STORAGE_KEY]?: string })[
          RESOLVED_IDENTITY_STORAGE_KEY
        ] || undefined,
      );
    });
  });
}

export async function saveResolvedIdentity(masterUserId: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [RESOLVED_IDENTITY_STORAGE_KEY]: masterUserId }, resolve);
  });
}

export async function clearResolvedIdentity(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome.storage.local.remove === "function") {
      chrome.storage.local.remove(RESOLVED_IDENTITY_STORAGE_KEY, resolve);
      return;
    }

    chrome.storage.local.set({ [RESOLVED_IDENTITY_STORAGE_KEY]: undefined }, resolve);
  });
}

async function getResolvedIdentityByTabState(): Promise<ResolvedIdentityByTabState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY], (result) => {
      resolve(
        ((result as { [RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY]?: ResolvedIdentityByTabState })[
          RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY
        ] as ResolvedIdentityByTabState | undefined) ?? {},
      );
    });
  });
}

export async function getResolvedIdentityForTab(tabId: number): Promise<string | undefined> {
  const state = await getResolvedIdentityByTabState();
  return state[String(tabId)] || undefined;
}

export async function saveResolvedIdentityForTab(
  tabId: number,
  masterUserId: string,
): Promise<void> {
  const state = await getResolvedIdentityByTabState();
  const nextState: ResolvedIdentityByTabState = {
    ...state,
    [String(tabId)]: masterUserId,
  };

  return new Promise((resolve) => {
    chrome.storage.local.set({ [RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY]: nextState }, resolve);
  });
}

export async function clearResolvedIdentityForTab(tabId: number): Promise<void> {
  const state = await getResolvedIdentityByTabState();
  const nextState: ResolvedIdentityByTabState = { ...state };
  delete nextState[String(tabId)];

  return new Promise((resolve) => {
    if (Object.keys(nextState).length === 0 && typeof chrome.storage.local.remove === "function") {
      chrome.storage.local.remove(RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY, resolve);
      return;
    }

    chrome.storage.local.set({ [RESOLVED_IDENTITY_BY_TAB_STORAGE_KEY]: nextState }, resolve);
  });
}

async function getKimiChatTranscriptSnapshotsState(): Promise<KimiChatTranscriptSnapshotsState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY], (result) => {
      resolve(
        ((result as {
          [KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY]?: KimiChatTranscriptSnapshotsState;
        })[KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY] as KimiChatTranscriptSnapshotsState | undefined) ??
          {},
      );
    });
  });
}

function buildKimiChatTranscriptSnapshotKey(
  operatorLarkId: string,
  sessionId: string,
): string {
  return `${operatorLarkId}:${sessionId}`;
}

export async function getKimiChatTranscriptSnapshot(input: {
  operatorLarkId: string;
  sessionId: string;
}): Promise<KimiChatTranscriptSnapshot | undefined> {
  const state = await getKimiChatTranscriptSnapshotsState();
  return state[buildKimiChatTranscriptSnapshotKey(input.operatorLarkId, input.sessionId)];
}

export async function saveKimiChatTranscriptSnapshot(
  snapshot: KimiChatTranscriptSnapshot,
): Promise<void> {
  const state = await getKimiChatTranscriptSnapshotsState();
  const nextState: KimiChatTranscriptSnapshotsState = {
    ...state,
    [buildKimiChatTranscriptSnapshotKey(snapshot.operatorLarkId, snapshot.sessionId)]: snapshot,
  };

  return new Promise((resolve) => {
    chrome.storage.local.set({ [KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY]: nextState }, resolve);
  });
}

export async function deleteKimiChatTranscriptSnapshot(input: {
  operatorLarkId: string;
  sessionId: string;
}): Promise<void> {
  const state = await getKimiChatTranscriptSnapshotsState();
  const nextState: KimiChatTranscriptSnapshotsState = { ...state };
  delete nextState[buildKimiChatTranscriptSnapshotKey(input.operatorLarkId, input.sessionId)];

  return new Promise((resolve) => {
    if (
      Object.keys(nextState).length === 0 &&
      typeof chrome.storage.local.remove === "function"
    ) {
      chrome.storage.local.remove(KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY, resolve);
      return;
    }

    chrome.storage.local.set({ [KIMI_CHAT_TRANSCRIPTS_STORAGE_KEY]: nextState }, resolve);
  });
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
      storageLogger.info("User token expired");
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
      storageLogger.info("Lark user token expired");
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
    pendingLarkOauthState: undefined,
    pendingLarkOauthStartedAt: undefined,
    pendingLarkOauthBaseUrl: undefined,
    pendingLarkOauthMasterUserId: undefined,
    lastLarkAuthResult: undefined,
  });
}

export async function savePendingLarkOauthState(input: {
  state: string;
  startedAt: string;
  baseUrl: string;
  masterUserId?: string;
}): Promise<void> {
  const current = await getAuthState();
  await saveAuthState({
    ...current,
    pendingLarkOauthState: input.state,
    pendingLarkOauthStartedAt: input.startedAt,
    pendingLarkOauthBaseUrl: input.baseUrl,
    pendingLarkOauthMasterUserId: input.masterUserId,
  });
}

export async function clearPendingLarkOauthState(state?: string): Promise<void> {
  const current = await getAuthState();

  if (state && current.pendingLarkOauthState && current.pendingLarkOauthState !== state) {
    return;
  }

  await saveAuthState({
    ...current,
    pendingLarkOauthState: undefined,
    pendingLarkOauthStartedAt: undefined,
    pendingLarkOauthBaseUrl: undefined,
    pendingLarkOauthMasterUserId: undefined,
  });
}

export async function saveLastLarkAuthResult(result: {
  state: string;
  status: "ready" | "failed";
  masterUserId?: string;
  reason?: string;
}): Promise<void> {
  const current = await getAuthState();
  await saveAuthState({
    ...current,
    lastLarkAuthResult: result,
  });
}

// ==================== Update State Storage ====================

/**
 * Get update state from storage
 */
export async function getUpdateState(): Promise<UpdateState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([UPDATE_STATE_STORAGE_KEY], (result) => {
      resolve((result[UPDATE_STATE_STORAGE_KEY] as UpdateState) || null);
    });
  });
}

/**
 * Save update state to storage
 */
export async function saveUpdateState(state: UpdateState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [UPDATE_STATE_STORAGE_KEY]: state }, resolve);
  });
}

/**
 * Clear ignored version and dismissed timestamp from update state
 */
export async function clearIgnoredVersion(): Promise<void> {
  const state = await getUpdateState();
  if (!state) {
    return;
  }

  await saveUpdateState({
    ...state,
    ignoredVersion: null,
    dismissedAt: null,
  });
}
