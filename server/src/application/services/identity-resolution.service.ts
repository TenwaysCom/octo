import type { IdentityResolveRequest } from "../../modules/identity/identity.dto.js";

export interface IdentityResolutionResult {
  requestId: string;
  operatorLarkId: string;
  meegleUserKey?: string;
  githubId?: string;
  sourcePlatform: IdentityResolveRequest["pageContext"]["platform"];
}

export function resolveIdentity(
  request: IdentityResolveRequest,
): IdentityResolutionResult {
  return {
    requestId: request.requestId,
    operatorLarkId: request.operatorLarkId,
    meegleUserKey: request.meegleUserKey,
    githubId: request.githubId,
    sourcePlatform: request.pageContext.platform,
  };
}
