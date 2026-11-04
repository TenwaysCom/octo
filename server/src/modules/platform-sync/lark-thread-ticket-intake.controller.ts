import type { Express } from "express";
import { ZodError } from "zod";
import { createActionErrorEnvelope, getActionRunId } from "../../application/action-error-envelope.js";
import { getSharedDatabase } from "../../adapters/postgres/database.js";
import { createLarkThreadTicketIntakeRuntime } from "../../application/services/lark-thread-ticket-intake.factory.js";
import { safeIntakeErrorCode } from "../../application/services/lark-thread-ticket-intake.service.js";
import { larkThreadTicketRangeSchema } from "../../domain/lark-thread-ticket-intake.js";
import { readPlatformSyncConfig, DEFAULT_PLATFORM_SYNC_CONFIG_PATH } from "../../config/platform-sync-config.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";

export function createLarkThreadTicketIntakeController(deps: {
  ensureSession?: typeof resolveLarkWebSessionIdentity;
  scanRange?: ReturnType<typeof createLarkThreadTicketIntakeRuntime>["scanRange"];
} = {}) {
  return async (input: { cookieHeader?: string; body: unknown }) => {
    const actionRunId = getActionRunId(input.body);
    const failure = (statusCode: number, errorCode: string, stage: string) => ({ statusCode, body: { ok: false as const,
      error: createActionErrorEnvelope({ module: "lark-thread-ticket-intake", stage, actionRunId, errorCode, errorMessage: errorCode }),
    } });
    try {
      const rawCookie = input.cookieHeader?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${WEB_SESSION_COOKIE_NAME}=`));
      let token: string | undefined;
      try { token = rawCookie ? decodeURIComponent(rawCookie.slice(WEB_SESSION_COOKIE_NAME.length + 1)) : undefined; } catch { /* Invalid session cookie is unauthenticated. */ }
      const session = await (deps.ensureSession ?? resolveLarkWebSessionIdentity)(token);
      if (!session.ok) return failure(401, "UNAUTHORIZED", "server.identity.resolved");
      if (!getWebWorkspaceAccess(session.role).platformSync) return failure(403, "WORKSPACE_ACCESS_DENIED", "server.auth.checked");
      const request = larkThreadTicketRangeSchema.parse(input.body);
      let scanRange = deps.scanRange;
      if (!scanRange) {
        const config = await readPlatformSyncConfig(process.env.PLATFORM_SYNC_CONFIG_PATH || DEFAULT_PLATFORM_SYNC_CONFIG_PATH);
        if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) return failure(503, "LARK_THREAD_TICKET_APP_REQUIRED", "server.thread_ticket.config");
        scanRange = createLarkThreadTicketIntakeRuntime({ db: getSharedDatabase(), config }).scanRange;
      }
      const data = await scanRange({ ...request, actionRunId });
      return { statusCode: 200, body: { ok: true as const, data } };
    } catch (error) {
      const code = error instanceof ZodError ? "INVALID_REQUEST" : safeIntakeErrorCode(error);
      return failure(code === "INVALID_REQUEST" ? 400 : code === "SYNC_ALREADY_RUNNING" ? 409 : 502,
        code, code === "INVALID_REQUEST" ? "server.action.received" : "server.thread_ticket.range");
    }
  };
}

export function registerLarkThreadTicketIntakeRoutes(app: Express) {
  const controller = createLarkThreadTicketIntakeController();
  app.post("/api/web/platform-sync/lark-thread-tickets", async (req, res) => {
    const result = await controller({ cookieHeader: req.headers.cookie, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
}
