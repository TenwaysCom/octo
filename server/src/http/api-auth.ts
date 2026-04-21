import type { NextFunction, Request, Response } from "express";

const DEFAULT_EXEMPT_PATHS = new Set([
  "/api/config/public",
  "/api/identity/resolve",
  "/api/debug/client-log",
  // OAuth callback is entered from Lark's redirect, so the browser will not
  // carry our custom master-user-id header here. This endpoint is still bound
  // to a user through the server-side OAuth session keyed by state.
  "/api/lark/auth/callback",
]);

function getMasterUserIdHeader(req: Request): string | undefined {
  const headerValue = req.headers["master-user-id"];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const normalized = typeof value === "string" ? value.trim() : "";

  return normalized.length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function upsertMasterUserId(
  source: unknown,
  masterUserId: string,
): { nextValue: unknown; conflict: boolean } {
  if (!isRecord(source)) {
    return { nextValue: source, conflict: false };
  }

  const existing = source.masterUserId;
  if (typeof existing === "string" && existing.length > 0 && existing !== masterUserId) {
    return { nextValue: source, conflict: true };
  }

  return {
    nextValue: {
      ...source,
      masterUserId,
    },
    conflict: false,
  };
}

export function createApiAuthMiddleware(exemptPaths: ReadonlySet<string> = DEFAULT_EXEMPT_PATHS) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS" || !req.path.startsWith("/api/") || exemptPaths.has(req.path)) {
      next();
      return;
    }

    const masterUserId = getMasterUserIdHeader(req);

    if (!masterUserId) {
      res.status(401).json({
        ok: false,
        error: {
          errorCode: "UNAUTHORIZED",
          errorMessage: "Missing master-user-id header",
        },
      });
      return;
    }

    const bodyResult = upsertMasterUserId(req.body, masterUserId);
    const queryResult = upsertMasterUserId(req.query, masterUserId);
    if (bodyResult.conflict || queryResult.conflict) {
      res.status(401).json({
        ok: false,
        error: {
          errorCode: "UNAUTHORIZED",
          errorMessage: "master-user-id header does not match request masterUserId",
        },
      });
      return;
    }

    req.body = bodyResult.nextValue;
    req.query = queryResult.nextValue as Request["query"];
    next();
  };
}
