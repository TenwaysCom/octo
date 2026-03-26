import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter.js";
import {
  InMemoryMeegleTokenStore,
  type MeegleTokenStore,
} from "../../adapters/meegle/token-store.js";
import type { IdentityStore } from "../../adapters/sqlite/identity-store.js";
import {
  exchangeCredential,
  refreshCredential,
} from "../../application/services/meegle-credential.service.js";
import {
  type MeegleAuthExchangeRequest,
  type MeegleAuthRefreshRequest,
  type MeegleGetAuthCodeRequest,
  validateMeegleAuthExchangeRequest,
  validateMeegleAuthRefreshRequest,
  validateMeegleAuthStatusRequest,
  validateMeegleGetAuthCodeRequest,
} from "./meegle-auth.dto.js";
import { MeegleClient } from "../../adapters/meegle/meegle-client.js";

export interface MeegleAuthServiceDeps {
  authAdapter: MeegleAuthAdapter;
  tokenStore?: MeegleTokenStore;
  pluginId?: string;
  identityStore?: IdentityStore;
}

let defaultDeps: MeegleAuthServiceDeps | undefined;
const sharedTokenStore = new InMemoryMeegleTokenStore();

export function configureMeegleAuthServiceDeps(
  deps: MeegleAuthServiceDeps,
): void {
  defaultDeps = deps;
}

function getDeps(overrides?: Partial<MeegleAuthServiceDeps>): MeegleAuthServiceDeps {
  const merged = {
    ...defaultDeps,
    ...overrides,
  };

  if (!merged.authAdapter) {
    throw new Error("Meegle auth adapter is not configured");
  }

  return {
    authAdapter: merged.authAdapter,
    tokenStore: merged.tokenStore ?? sharedTokenStore,
    pluginId: merged.pluginId,
    identityStore: merged.identityStore,
  };
}

export async function exchangeAuthCode(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request: MeegleAuthExchangeRequest =
    validateMeegleAuthExchangeRequest(input);
  const deps = getDeps(overrides);
  const result = await exchangeCredential(request, {
    authAdapter: deps.authAdapter,
    tokenStore: deps.tokenStore!,
  });

  await deps.identityStore?.save({
    larkId: request.operatorLarkId,
    meegleUserKey: request.meegleUserKey,
  });

  return result;
}

export async function refreshAuthToken(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request: MeegleAuthRefreshRequest =
    validateMeegleAuthRefreshRequest(input);
  const deps = getDeps(overrides);
  return refreshCredential(request, {
    authAdapter: deps.authAdapter,
    tokenStore: deps.tokenStore!,
  });
}

export async function checkAuthStatus(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request = validateMeegleAuthStatusRequest(input);
  const deps = getDeps(overrides);
  const baseUrl = request.baseUrl ?? "https://project.larksuite.com";
  const resolvedIdentity = request.meegleUserKey
    ? { meegleUserKey: request.meegleUserKey }
    : await deps.identityStore?.getByLarkId(request.operatorLarkId);
  const meegleUserKey = resolvedIdentity?.meegleUserKey ?? request.meegleUserKey;

  if (!meegleUserKey) {
    return {
      ok: true,
      data: {
        status: "require_auth_code" as const,
        operatorLarkId: request.operatorLarkId,
        baseUrl,
        reason: "Missing meegleUserKey for token lookup",
      },
    };
  }

  const stored = await deps.tokenStore?.get({
    operatorLarkId: request.operatorLarkId,
    meegleUserKey,
    baseUrl,
  });

  if (!stored?.userToken) {
    return {
      ok: true,
      data: {
        status: "require_auth_code" as const,
        operatorLarkId: request.operatorLarkId,
        meegleUserKey,
        baseUrl,
        reason: "No stored Meegle token found",
      },
    };
  }

  return {
    ok: true,
    data: {
        status: "ready" as const,
        operatorLarkId: request.operatorLarkId,
        meegleUserKey,
        baseUrl,
        reason: "Stored Meegle token is available",
      },
  };
}

export async function getAuthCode(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request: MeegleGetAuthCodeRequest =
    validateMeegleGetAuthCodeRequest(input);

  const deps = getDeps(overrides);

  if (!deps.pluginId) {
    throw new Error("Missing pluginId configuration");
  }

  const client = new MeegleClient({
    userToken: "dummy", // Not used for auth code endpoint
    userKey: "dummy", // Not used for auth code endpoint
    baseUrl: request.baseUrl,
    pluginId: deps.pluginId,
  });

  const authCode = await client.getAuthCode({
    baseUrl: request.baseUrl,
    cookie: request.cookie,
    state: request.state,
  });

  return {
    ok: true,
    data: {
      authCode,
    },
  };
}
