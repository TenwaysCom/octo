/**
 * Authenticated Lark Client Factory
 *
 * Creates LarkClient instances with automatic token refresh.
 * Centralizes token expiry checks so business code doesn't need to handle it.
 */

import { LarkClient } from "../../adapters/lark/lark-client.js";
import type { LarkTokenStore } from "../../adapters/lark/token-store.js";
import { getSharedLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import { refreshLarkToken } from "../../modules/lark-auth/lark-auth.service.js";

export interface AuthenticatedLarkClientFactoryDeps {
  getLarkTokenStore?: () => LarkTokenStore;
  refreshLarkToken?: typeof refreshLarkToken;
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
}

export interface AuthenticatedLarkClientResult {
  client: LarkClient;
  baseUrl: string;
}

const EXPIRY_SAFETY_WINDOW_MS = 60_000;

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

function toExpiresAt(expiresInSeconds?: number): string | undefined {
  if (
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds <= 0
  ) {
    return undefined;
  }
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

/**
 * Build an authenticated LarkClient for the given user.
 * Automatically refreshes the access token if it has expired.
 */
export async function buildAuthenticatedLarkClient(
  masterUserId: string,
  baseUrl: string,
  deps: AuthenticatedLarkClientFactoryDeps = {},
): Promise<AuthenticatedLarkClientResult> {
  const tokenStore = deps.getLarkTokenStore?.() ?? getSharedLarkTokenStore();
  const stored = await tokenStore.get({
    masterUserId,
    baseUrl,
  });

  if (!stored) {
    throw new Error("Lark token not found for user");
  }

  let accessToken = stored.userToken;

  if (isExpired(stored.userTokenExpiresAt) && stored.refreshToken) {
    const refreshed = await (deps.refreshLarkToken ?? refreshLarkToken)({
      masterUserId,
      baseUrl: stored.baseUrl,
      refreshToken: stored.refreshToken,
    });

    accessToken = refreshed.accessToken;

    await tokenStore.save({
      masterUserId: stored.masterUserId,
      tenantKey: stored.tenantKey,
      larkUserId: stored.larkUserId,
      baseUrl: stored.baseUrl,
      userToken: refreshed.accessToken,
      userTokenExpiresAt: toExpiresAt(refreshed.expiresIn),
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
      credentialStatus: "active",
    });
  }

  const client = deps.createLarkClient
    ? deps.createLarkClient(accessToken, stored.baseUrl)
    : new LarkClient({ accessToken, baseUrl: stored.baseUrl });

  return { client, baseUrl: stored.baseUrl };
}
