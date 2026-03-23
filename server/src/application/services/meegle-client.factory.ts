/**
 * Meegle Client Factory
 *
 * Creates MeegleClient instances from stored credentials
 */

import { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import type { MeegleTokenStore } from "../../adapters/meegle/token-store.js";

export interface MeegleClientFactoryDeps {
  tokenStore: MeegleTokenStore;
}

export interface MeegleClientConfig {
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
}

/**
 * Create a MeegleClient for the given user
 */
export async function createMeegleClient(
  config: MeegleClientConfig,
  deps: MeegleClientFactoryDeps,
): Promise<MeegleClient> {
  const { tokenStore } = deps;
  const { operatorLarkId, meegleUserKey, baseUrl } = config;

  const storedToken = await tokenStore.get({
    operatorLarkId,
    meegleUserKey,
    baseUrl,
  });

  if (!storedToken?.userToken) {
    throw new Error(
      `No valid Meegle token found for user ${operatorLarkId} at ${baseUrl}`,
    );
  }

  return new MeegleClient({
    userToken: storedToken.userToken,
    userKey: storedToken.meegleUserKey,
    baseUrl: storedToken.baseUrl,
  });
}

/**
 * Check if a user has valid Meegle credentials
 */
export async function hasValidMeegleToken(
  config: MeegleClientConfig,
  deps: MeegleClientFactoryDeps,
): Promise<boolean> {
  const { tokenStore } = deps;
  const storedToken = await tokenStore.get(config);
  return !!storedToken?.userToken;
}
