import { ZodError } from "zod";

import { OdooDevopsBranchesClientError } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import { OdooDevopsBranchesService } from "../../application/services/odoo-devops-branches.service.js";
import { ensureLarkWebSession } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { logger } from "../../logger.js";
import {
  odooDevopsBranchesCacheResetBodySchema,
  odooDevopsBranchesQuerySchema,
  odooDevopsBranchesRefreshingSchema,
} from "./odoo-devops-branches.dto.js";

type WebSessionResult = Awaited<ReturnType<typeof ensureLarkWebSession>>;
const controllerLogger = logger.child({ module: "odoo-devops-branches" });
const REFRESH_RETRY_AFTER_MS = 1_000;

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return undefined;
  }
}

/**
 * 冷缓存返回 202 refreshing（前端按 retryAfterMs 有界重试），已有快照立即返回并
 * 在过期时标记 stale、合并后台刷新；读取不串行等待上游或同步链路。
 */
export function createWebOdooDevopsBranchesController(deps: {
  service: Pick<OdooDevopsBranchesService, "getOrStartRefresh">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
}) {
  const ensureSession = deps.ensureSession ?? ensureLarkWebSession;

  return async function getWebOdooDevopsBranches(input: { cookieHeader: string | undefined; query: unknown }) {
    const session = await ensureSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return {
        statusCode: 401,
        body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
      };
    }

    try {
      const query = odooDevopsBranchesQuerySchema.parse(input.query);
      const result = await deps.service.getOrStartRefresh(query.environment);
      if (result.state === "refreshing") {
        return {
          statusCode: 202,
          body: {
            ok: true as const,
            data: odooDevopsBranchesRefreshingSchema.parse({
              state: "refreshing",
              environment: query.environment,
              retryAfterMs: REFRESH_RETRY_AFTER_MS,
            }),
          },
        };
      }
      if (result.state === "unavailable") {
        return {
          statusCode: 503,
          body: {
            ok: false as const,
            error: {
              errorCode: "ODOO_DEVOPS_UNAVAILABLE",
              errorMessage: "Odoo DevOps 分支状态暂时不可用。",
            },
          },
        };
      }
      return {
        statusCode: 200,
        body: {
          ok: true as const,
          data: {
            ...result.snapshot,
            cached: result.cached,
            stale: result.stale,
          },
        },
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          statusCode: 400,
          body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } },
        };
      }
      if (error instanceof OdooDevopsBranchesClientError) {
        return {
          statusCode: 503,
          body: {
            ok: false as const,
            error: { errorCode: error.code, errorMessage: "Odoo DevOps 分支状态暂时不可用。" },
          },
        };
      }
      controllerLogger.error({
        operation: "odoo_devops_branches_read",
        layer: "server",
        stage: "server.read.failed",
        errorCode: "ODOO_DEVOPS_INVALID_RESPONSE",
      }, "ODOO_DEVOPS_BRANCHES_READ_FAILED");
      return {
        statusCode: 502,
        body: {
          ok: false as const,
          error: { errorCode: "ODOO_DEVOPS_INVALID_RESPONSE", errorMessage: "Odoo DevOps 返回了无效的分支状态。" },
        },
      };
    }
  };
}

export function createWebOdooDevopsBranchesCacheResetController(deps: {
  service: Pick<OdooDevopsBranchesService, "invalidateAll">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
}) {
  const ensureSession = deps.ensureSession ?? ensureLarkWebSession;

  return async function resetWebOdooDevopsBranchesCache(input: { cookieHeader: string | undefined; body: unknown }) {
    const session = await ensureSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return {
        statusCode: 401,
        body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
      };
    }

    try {
      const request = odooDevopsBranchesCacheResetBodySchema.parse(input.body);
      const invalidated = await deps.service.invalidateAll();
      if (!invalidated) {
        return {
          statusCode: 503,
          body: { ok: false as const, error: { errorCode: "ODOO_DEVOPS_CACHE_RESET_UNAVAILABLE", errorMessage: "DevOps 缓存暂时无法重置。" } },
        };
      }
      controllerLogger.info({
        actionRunId: request.actionRunId,
        operation: "odoo_devops_cache_reset",
        layer: "server",
        stage: "server.cache.invalidated",
        environments: ["eu", "uk", "us"],
      }, "ODOO_DEVOPS_CACHE_RESET");
      return {
        statusCode: 200,
        body: { ok: true as const, data: { environments: ["eu", "uk", "us"], actionRunId: request.actionRunId } },
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          statusCode: 400,
          body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } },
        };
      }
      return {
        statusCode: 502,
        body: { ok: false as const, error: { errorCode: "ODOO_DEVOPS_CACHE_RESET_FAILED", errorMessage: "无法重置 Odoo DevOps 缓存。" } },
      };
    }
  };
}
