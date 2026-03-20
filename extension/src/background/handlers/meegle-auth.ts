import type {
  MeegleAuthCodeResponse,
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "../../types/meegle";

export interface EnsureMeegleAuthDeps {
  getCachedToken?: () => string | undefined;
  requestAuthCode?: (
    request: MeegleAuthEnsureRequest,
  ) => Promise<MeegleAuthCodeResponse | undefined>;
}

export async function ensureMeegleAuth(
  request: Partial<MeegleAuthEnsureRequest> = {},
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResponse> {
  const baseUrl = request.baseUrl ?? "https://project.larksuite.com";
  const state = request.state;

  if (!request.requestId || !request.operatorLarkId || !state) {
    return {
      status: "failed",
      baseUrl,
      reason: "MEEGLE_AUTH_REQUIRED",
    };
  }

  const cachedToken = deps.getCachedToken?.();

  if (cachedToken) {
    return {
      status: "ready",
      baseUrl,
      state,
    };
  }

  const authResult = await deps.requestAuthCode?.({
    requestId: request.requestId,
    operatorLarkId: request.operatorLarkId,
    meegleUserKey: request.meegleUserKey,
    baseUrl,
    state,
  });

  if (authResult) {
    if (authResult.state !== state) {
      return {
        status: "failed",
        baseUrl,
        state,
        reason: "MEEGLE_AUTH_CODE_STATE_MISMATCH",
      };
    }

    return {
      status: "ready",
      baseUrl,
      state: authResult.state,
      authCode: authResult.authCode,
      issuedAt: authResult.issuedAt,
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
