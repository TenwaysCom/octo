import type { NextFunction, Request, Response } from "express";

const DEFAULT_EXEMPT_PATHS = new Set([
  "/api/config/public",
  "/api/config/page",
  "/api/config/server-api-catalog",
  "/api/extension/version",
  "/api/identity/resolve",
  "/api/debug/client-log",
  // OAuth callback is entered from Lark's redirect, so the browser will not
  // carry our custom master-user-id header here. This endpoint is still bound
  // to a user through the server-side OAuth session keyed by state.
  "/api/lark/auth/callback",
  "/api/lark/auth/web/start",
  "/api/lark/auth/web/ensure",
  "/api/lark/auth/web/logout",
  "/api/web/profile",
  "/api/web/ssh-public-keys",
  "/api/web/lark-ticket-eval-samples",
  "/api/web/platform-data/lark-tickets",
  "/api/web/platform-data/meegle-workitems",
  "/api/web/meegle-workitems/pull-request-candidates",
  "/api/web/meegle-workitems/link-pull-request",
  "/api/web/platform-data/github-pull-requests",
  "/api/web/platform-data/github-pull-request-preview",
  "/api/web/meegle-sprints",
  "/api/web/platform-sync-sources",
  "/api/web/odoo-devops-branches",
  "/api/web/github-pr-odoo-devops-build",
  "/api/web/odoo-devops-branches/reset-cache",
  "/api/web/plugin-login/start",
  "/api/web/plugin-login/complete",
  // This route uses its own internal-network and SSH-signature authentication.
  "/api/internal/lark-ticket-ai",
  "/api/internal/acp/ticket-context/messages",
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
    if (req.method === "OPTIONS" || !req.path.startsWith("/api/") || exemptPaths.has(req.path) || req.path.startsWith("/api/web/platform-sync-sources/") || req.path.startsWith("/api/web/lark-tickets/") || req.path.startsWith("/api/web/meegle-sprints/")) {
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
    next();
  };
}
