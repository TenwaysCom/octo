import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter.js";
import {
  InMemoryMeegleTokenStore,
  type MeegleTokenStore,
} from "../../adapters/meegle/token-store.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
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
import { normalizeMeegleAuthBaseUrl } from "../../platform-url.js";

export interface MeegleAuthServiceDeps {
  authAdapter: MeegleAuthAdapter;
  tokenStore?: MeegleTokenStore;
  pluginId?: string;
  meegleAuthBaseUrl?: string;
}

let defaultDeps: MeegleAuthServiceDeps | undefined;
const sharedTokenStore = new InMemoryMeegleTokenStore();
const SERVER_SERVICE_FLOW_PREFIX = "[MEEGLE_AUTH_FLOW][SERVER][SERVICE]";

function logServiceFlow(node: string, phase: "START" | "OK" | "FAIL", detail: Record<string, unknown>): void {
  const logger = phase === "FAIL" ? console.error : console.log;
  logger(`${SERVER_SERVICE_FLOW_PREFIX}[${node}][${phase}]`, detail);
}

export function configureMeegleAuthServiceDeps(
  deps: MeegleAuthServiceDeps,
): void {
  defaultDeps = deps;
}

function getDeps(overrides?: Partial<MeegleAuthServiceDeps>): MeegleAuthServiceDeps {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<MeegleAuthServiceDeps>;

  const merged = {
    ...defaultDeps,
    ...definedOverrides,
  };

  if (!merged.authAdapter) {
    throw new Error("Meegle auth adapter is not configured");
  }

  return {
    authAdapter: merged.authAdapter,
    tokenStore: merged.tokenStore ?? sharedTokenStore,
    pluginId: merged.pluginId,
    meegleAuthBaseUrl: merged.meegleAuthBaseUrl,
  };
}

export function getConfiguredMeegleAuthServiceDeps(
  overrides?: Partial<MeegleAuthServiceDeps>,
): MeegleAuthServiceDeps {
  return getDeps(overrides);
}

export async function exchangeAuthCode(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  logServiceFlow("EXCHANGE_AUTH_CODE", "START", { inputType: typeof input });
  const request: MeegleAuthExchangeRequest =
    validateMeegleAuthExchangeRequest(input);
  const deps = getDeps(overrides);
  const user = await getResolvedUserStore().getById(request.masterUserId);
  const result = await exchangeCredential(request, {
    authAdapter: deps.authAdapter,
    tokenStore: deps.tokenStore!,
    meegleAuthBaseUrl: deps.meegleAuthBaseUrl,
  });

  if (user) {
    await getResolvedUserStore().update({
      ...user,
      meegleBaseUrl: user.meegleBaseUrl ?? request.baseUrl,
      meegleUserKey: user.meegleUserKey ?? request.meegleUserKey,
    });
  }

  logServiceFlow("EXCHANGE_AUTH_CODE", "OK", { requestId: request.requestId, masterUserId: request.masterUserId, meegleUserKey: request.meegleUserKey, baseUrl: request.baseUrl, tokenStatus: result.tokenStatus, credentialStatus: result.credentialStatus, expiresAt: result.expiresAt });

  return result;
}

export async function refreshAuthToken(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request: MeegleAuthRefreshRequest =
    validateMeegleAuthRefreshRequest(input);
  const deps = getDeps(overrides);
  return refreshCredential(
    {
      ...request,
      baseUrl: normalizeMeegleAuthBaseUrl(
        request.baseUrl,
        deps.meegleAuthBaseUrl,
      ),
    },
    {
      authAdapter: deps.authAdapter,
      tokenStore: deps.tokenStore!,
      meegleAuthBaseUrl: deps.meegleAuthBaseUrl,
    },
  );
}

export async function checkAuthStatus(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  logServiceFlow("CHECK_AUTH_STATUS", "START", { inputType: typeof input });
  const request = validateMeegleAuthStatusRequest(input);
  const deps = getDeps(overrides);
  const user = await getResolvedUserStore().getById(request.masterUserId);
  const baseUrl = request.baseUrl ?? user?.meegleBaseUrl ?? "https://project.larksuite.com";
  const meegleUserKey = request.meegleUserKey ?? user?.meegleUserKey ?? undefined;

  if (!meegleUserKey) {
    logServiceFlow("CHECK_AUTH_STATUS", "FAIL", { masterUserId: request.masterUserId, baseUrl, reason: "MISSING_MEEGLE_USER_KEY" });
    return {
      ok: true,
      data: {
        status: "require_auth_code" as const,
        masterUserId: request.masterUserId,
        baseUrl,
        reason: "Missing meegleUserKey for token lookup",
      },
    };
  }

  const stored = await deps.tokenStore?.get({
    masterUserId: request.masterUserId,
    meegleUserKey,
    baseUrl,
  });

  if (!stored?.userToken) {
    logServiceFlow("CHECK_AUTH_STATUS", "FAIL", { masterUserId: request.masterUserId, meegleUserKey, baseUrl, reason: "NO_STORED_TOKEN" });
    return {
      ok: true,
      data: {
        status: "require_auth_code" as const,
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl,
        reason: "No stored Meegle token found",
      },
    };
  }

  const refreshedStatus = await refreshCredential(
    {
      masterUserId: request.masterUserId,
      meegleUserKey,
      baseUrl,
    },
    {
      authAdapter: deps.authAdapter,
      tokenStore: deps.tokenStore!,
      meegleAuthBaseUrl: deps.meegleAuthBaseUrl,
    },
  );

  if (refreshedStatus.tokenStatus !== "ready") {
    logServiceFlow("CHECK_AUTH_STATUS", "FAIL", { masterUserId: request.masterUserId, meegleUserKey, requestedBaseUrl: baseUrl, resolvedBaseUrl: refreshedStatus.baseUrl, reason: refreshedStatus.errorCode || "Stored Meegle token expired" });
    return {
      ok: true,
      data: {
        status: "require_auth_code" as const,
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl,
        reason: refreshedStatus.errorCode || "Stored Meegle token expired",
      },
    };
  }

  logServiceFlow("CHECK_AUTH_STATUS", "OK", { masterUserId: request.masterUserId, meegleUserKey, requestedBaseUrl: baseUrl, resolvedBaseUrl: refreshedStatus.baseUrl, credentialStatus: refreshedStatus.credentialStatus, expiresAt: refreshedStatus.expiresAt });

  return {
    ok: true,
    data: {
        status: "ready" as const,
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl: refreshedStatus.baseUrl,
        credentialStatus: refreshedStatus.credentialStatus,
        expiresAt: refreshedStatus.expiresAt,
        reason: stored.userTokenExpiresAt ? "Stored Meegle token is available" : "Stored Meegle token refreshed",
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
  const baseUrl = normalizeMeegleAuthBaseUrl(
    request.baseUrl,
    deps.meegleAuthBaseUrl,
  );

  if (!deps.pluginId) {
    throw new Error("Missing pluginId configuration");
  }

  const client = new MeegleClient({
    userToken: "dummy", // Not used for auth code endpoint
    userKey: "dummy", // Not used for auth code endpoint
    baseUrl,
    pluginId: deps.pluginId,
  });

  const authCode = await client.getAuthCode({
    baseUrl,
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
