import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { createPlatformSearchService } from "../../application/services/platform-search.service.js";
import { getActionRunId } from "../../application/action-error-envelope.js";
import { logger } from "../../logger.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  kind: z.enum(["lark-tickets", "meegle-workitems", "github-pull-requests"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  actionRunId: z.string().trim().min(1).max(128).optional(),
}).strict();

export function createWebPlatformSearchController(deps: {
  service?: ReturnType<typeof createPlatformSearchService>;
  ensureSession?: typeof resolveLarkWebSessionIdentity;
} = {}) {
  const service = deps.service ?? createPlatformSearchService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;
  return async (input: { cookieHeader: string | undefined; query: unknown; operation: "search" | "ticket-filter-options" }) => {
    const requestedRunId = getActionRunId(input.query);
    const actionRunId = requestedRunId && requestedRunId.length <= 128 ? requestedRunId : randomUUID();
    const context = { actionRunId, layer: "server" as const, module: "platform-search", stage: "server.search.read" };
    const fail = (statusCode: number, errorCode: string, errorMessage: string) => ({
      statusCode, body: { ok: false as const, error: { ...context, errorCode, errorMessage } },
    });
    try {
      const rawCookie = input.cookieHeader?.split(";").map((part) => part.trim())
        .find((part) => part.startsWith(`${WEB_SESSION_COOKIE_NAME}=`))?.slice(WEB_SESSION_COOKIE_NAME.length + 1);
      let token: string | undefined;
      try { token = rawCookie ? decodeURIComponent(rawCookie) : undefined; } catch { token = undefined; }
      const session = await ensureSession(token);
      if (!session.ok) return fail(401, session.errorCode, session.errorMessage);
      if (!getWebWorkspaceAccess(session.role).platformLists) return fail(403, "WORKSPACE_ACCESS_DENIED", "当前角色无权查看平台列表。");
      let data;
      if (input.operation === "search") {
        const query = searchQuerySchema.parse(input.query);
        data = await service.search({ query: query.q, limit: query.limit, offset: query.offset, ...(query.kind ? { kind: query.kind } : {}) });
      } else {
        z.object({}).strict().parse(input.query);
        data = await service.listTicketFilterOptions();
      }
      return { statusCode: 200, body: { ok: true as const, data, actionRunId } };
    } catch (error) {
      if (error instanceof ZodError) return fail(400, "INVALID_REQUEST", "搜索参数无效。");
      logger.error({ ...context, errorCode: "PLATFORM_SEARCH_READ_FAILED" }, "Platform search read failed");
      return fail(500, "PLATFORM_SEARCH_READ_FAILED", "搜索数据暂时无法读取，请稍后重试。");
    }
  };
}

export function registerWebPlatformSearchRoutes(app: Express) {
  const controller = createWebPlatformSearchController();
  app.get("/api/web/platform-data/search", async (req, res) => {
    const result = await controller({ cookieHeader: req.headers.cookie, query: req.query, operation: "search" });
    res.status(result.statusCode).json(result.body);
  });
  app.get("/api/web/platform-data/lark-ticket-filter-options", async (req, res) => {
    const result = await controller({ cookieHeader: req.headers.cookie, query: req.query, operation: "ticket-filter-options" });
    res.status(result.statusCode).json(result.body);
  });
}
