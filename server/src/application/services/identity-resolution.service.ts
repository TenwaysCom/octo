import {
  getResolvedUserStore,
  type ResolvedUserRecord,
} from "../../adapters/sqlite/resolved-user-store.js";
import type { IdentityResolveRequest } from "../../modules/identity/identity.dto.js";

export interface IdentityResolutionResponse {
  ok: true;
    data: {
      requestId: string;
      masterUserId: string;
      identityStatus: ResolvedUserRecord["status"];
      operatorLarkId?: string;
      larkEmail?: string;
      meegleUserKey?: string;
    githubId?: string;
    sourcePlatform: IdentityResolveRequest["pageContext"]["platform"];
  };
}

function toResponse(
  request: IdentityResolveRequest,
  user: ResolvedUserRecord,
): IdentityResolutionResponse {
  return {
    ok: true,
    data: {
      requestId: request.requestId,
      masterUserId: user.id,
      identityStatus: user.status,
      operatorLarkId: user.larkId ?? undefined,
      larkEmail: user.larkEmail ?? undefined,
      meegleUserKey: user.meegleUserKey ?? undefined,
      githubId: user.githubId ?? undefined,
      sourcePlatform: request.pageContext.platform,
    },
  };
}

export async function resolveIdentity(
  request: IdentityResolveRequest,
): Promise<IdentityResolutionResponse> {
  const store = getResolvedUserStore();
  const requestedMeegleBaseUrl = getRequestedMeegleBaseUrl(request);

  if (request.masterUserId) {
    const existing = await store.getById(request.masterUserId);
    if (existing) {
      const updated = await applyHints(existing, request);
      return toResponse(request, updated);
    }
  }

  const larkMatch = request.operatorLarkId
    ? await store.getByLarkId(request.operatorLarkId)
    : undefined;
  const meegleMatch = request.meegleUserKey && requestedMeegleBaseUrl
    ? await store.getByMeegleIdentity(requestedMeegleBaseUrl, request.meegleUserKey)
    : undefined;

  if (larkMatch && meegleMatch && larkMatch.id !== meegleMatch.id) {
    return toResponse(request, {
      ...larkMatch,
      status: "conflict",
    });
  }

  if (larkMatch) {
    return toResponse(request, await applyHints(larkMatch, request));
  }

  if (meegleMatch) {
    return toResponse(request, await applyHints(meegleMatch, request));
  }

  const created = await store.create({
    status: request.operatorLarkId ? "active" : "pending_lark_identity",
    larkId: request.operatorLarkId,
    larkEmail: undefined,
    meegleBaseUrl: requestedMeegleBaseUrl,
    meegleUserKey: request.meegleUserKey,
    githubId: request.githubId,
  });

  return toResponse(request, created);
}

async function applyHints(
  user: ResolvedUserRecord,
  request: IdentityResolveRequest,
): Promise<ResolvedUserRecord> {
  const requestedMeegleBaseUrl = getRequestedMeegleBaseUrl(request);
  const nextUser: ResolvedUserRecord = {
    ...user,
    larkId: user.larkId ?? request.operatorLarkId ?? null,
    larkEmail: user.larkEmail ?? null,
    meegleBaseUrl: user.meegleBaseUrl ?? requestedMeegleBaseUrl ?? null,
    meegleUserKey: user.meegleUserKey ?? request.meegleUserKey ?? null,
    githubId: user.githubId ?? request.githubId ?? null,
    status:
      user.larkId || request.operatorLarkId
        ? "active"
        : user.status,
  };

  if (
    nextUser.larkId === user.larkId &&
    nextUser.larkEmail === user.larkEmail &&
    nextUser.meegleBaseUrl === user.meegleBaseUrl &&
    nextUser.meegleUserKey === user.meegleUserKey &&
    nextUser.githubId === user.githubId &&
    nextUser.status === user.status
  ) {
    return user;
  }

  return getResolvedUserStore().update(nextUser);
}

function getRequestedMeegleBaseUrl(
  request: IdentityResolveRequest,
): string | undefined {
  if (!request.meegleUserKey) {
    return undefined;
  }

  if (request.pageContext.platform !== "meegle") {
    return undefined;
  }

  return request.pageContext.baseUrl;
}
