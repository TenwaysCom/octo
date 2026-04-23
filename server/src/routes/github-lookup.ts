import { Router } from "express";
import { GitHubClient } from "../adapters/github/github-client.js";
import { GitHubReverseLookupController } from "../controllers/github-reverse-lookup.js";
import {
  MeegleAPIError,
  MeegleAuthenticationError,
  MeegleNotFoundError,
  MeegleRateLimitError,
} from "../adapters/meegle/meegle-client.js";
import { getResolvedUserStore } from "../adapters/postgres/resolved-user-store.js";
import { refreshCredential } from "../application/services/meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../modules/meegle-auth/meegle-auth.service.js";
import { createMeegleClient } from "../application/services/meegle-client.factory.js";
import { logger } from "../logger.js";

const routeLogger = logger.child({ module: "github-lookup-route" });

export interface GitHubLookupRouteOptions {
  githubToken: string;
}

function getMasterUserIdHeader(req: { headers: Record<string, unknown> }): string | undefined {
  const headerValue = req.headers["master-user-id"];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
}

export function createGitHubLookupRouter(options: GitHubLookupRouteOptions): Router {
  const router = Router();
  const githubClient = new GitHubClient({ token: options.githubToken });
  const controller = new GitHubReverseLookupController(githubClient);

  router.post("/lookup-meegle", async (req, res) => {
    try {
      const { prUrl } = req.body;
      const masterUserId = getMasterUserIdHeader(req);

      if (!prUrl || typeof prUrl !== "string") {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_REQUEST", message: "prUrl is required" },
        });
      }

      if (!masterUserId) {
        return res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing master-user-id header" },
        });
      }

      // Resolve user and get Meegle credentials
      const resolvedUser = await getResolvedUserStore().getById(masterUserId);
      const meegleUserKey = resolvedUser?.meegleUserKey;

      if (!meegleUserKey) {
        return res.status(400).json({
          success: false,
          error: {
            code: "USER_NOT_RESOLVED",
            message: "Meegle user key not found for master user",
          },
        });
      }

      const authDeps = getConfiguredMeegleAuthServiceDeps();
      const baseUrl = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";

      const refreshResult = await refreshCredential(
        { masterUserId, meegleUserKey, baseUrl },
        {
          authAdapter: authDeps.authAdapter,
          tokenStore: authDeps.tokenStore!,
          meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
        },
      );

      if (refreshResult.tokenStatus !== "ready" || !refreshResult.userToken) {
        return res.status(401).json({
          success: false,
          error: {
            code: "AUTH_EXPIRED",
            message: "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。",
          },
        });
      }

      // Create user-level MeegleClient
      const meegleClient = await createMeegleClient(
        { masterUserId, meegleUserKey, baseUrl },
        { tokenStore: authDeps.tokenStore! },
      );

      const result = await controller.lookup(prUrl, meegleClient);
      res.json({ success: true, data: result });
    } catch (error) {
      let code = "UNKNOWN_ERROR";
      let status = 500;
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof MeegleAuthenticationError) {
        code = "MEEGLE_AUTH_ERROR";
        status = 401;
      } else if (error instanceof MeegleNotFoundError) {
        code = "MEEGLE_NOT_FOUND";
        status = 404;
      } else if (error instanceof MeegleRateLimitError) {
        code = "MEEGLE_RATE_LIMIT";
        status = 429;
      } else if (error instanceof MeegleAPIError) {
        code = "MEEGLE_API_ERROR";
        status = error.statusCode ?? 500;
      } else if (error instanceof Error && (error as Error & { code?: string }).code === "NO_MEEGLE_ID_FOUND") {
        code = "NO_MEEGLE_ID_FOUND";
        status = 404;
      } else if (error instanceof Error && (error as Error & { code?: string }).code === "INVALID_PR_URL") {
        code = "INVALID_PR_URL";
        status = 400;
      }

      routeLogger.warn({ code, status, message, originalError: error instanceof Error ? error.name : "unknown" }, "GitHub lookup error");

      res.status(status).json({
        success: false,
        error: { code, message },
      });
    }
  });

  return router;
}
