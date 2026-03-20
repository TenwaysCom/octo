import type {
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "../../types/meegle";

export interface EnsureMeegleAuthDeps {
  getCachedToken?: () => string | undefined;
  requestAuthCode?: (
    request: MeegleAuthEnsureRequest,
  ) => Promise<string | undefined>;
}

export async function ensureMeegleAuth(
  request: Partial<MeegleAuthEnsureRequest> = {},
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  const baseUrl = request.baseUrl ?? "https://project.larksuite.com";
  const state = request.state ?? "111";
  const cachedToken = deps.getCachedToken?.();

  if (cachedToken) {
    return {
      status: "ready",
      baseUrl,
      state,
    };
  }

  const authCode = await deps.requestAuthCode?.({
    requestId: request.requestId ?? "req-auth",
    operatorLarkId: request.operatorLarkId ?? "unknown",
    meegleUserKey: request.meegleUserKey,
    baseUrl,
    state,
  });

  if (authCode) {
    return {
      status: "ready",
      baseUrl,
      state,
      authCode,
    };
  }

  return {
    status: "require_auth_code",
    baseUrl,
    state,
  };
}

export async function runAuthBridgeFlow(
  request: MeegleAuthEnsureRequest,
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  return ensureMeegleAuth(request, deps);
}
