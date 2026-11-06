import type { Express } from "express";
import { z, ZodError } from "zod";
import { createTicketFieldSubmissionService, TicketSubmissionError } from "../../application/services/lark-ticket-field-submission.service.js";
import { toLarkTicketSourceError, LarkTicketError } from "../../application/services/lark-ticket.service.js";
import { ticketFieldSubmissionSchema, ticketSubmissionReferenceSchema } from "../../domain/lark-ticket-field-submission.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";

export function createTicketFieldSubmissionController(deps: {
  service?: ReturnType<typeof createTicketFieldSubmissionService>;
  resolveSession?: typeof resolveLarkWebSessionIdentity;
} = {}) {
  const service = deps.service ?? createTicketFieldSubmissionService();
  return async (operation: "submit" | "get" | "reconcile" | "retrySync" | "snapshot", input: {
    cookieHeader?: string; recordId: string; submissionId?: string; payload: unknown;
  }) => {
    const run = z.object({ actionRunId: z.string().trim().min(1).max(128) }).safeParse(input.payload);
    const diagnostics = { ...(run.success ? { actionRunId: run.data.actionRunId } : {}), layer: "server", module: "lark-ticket-field-submission", stage: `server.ticket-fields.${operation}` };
    try {
      const rawCookie = input.cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${WEB_SESSION_COOKIE_NAME}=`))?.slice(WEB_SESSION_COOKIE_NAME.length + 1);
      const session = await (deps.resolveSession ?? resolveLarkWebSessionIdentity)(rawCookie ? decodeURIComponent(rawCookie) : undefined);
      if (!session.ok) return { statusCode: 401, body: { ok: false, error: { ...diagnostics, errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      if (!getWebWorkspaceAccess(session.role).platformSync) throw new TicketSubmissionError("WORKSPACE_ACCESS_DENIED", "当前角色无权修改 Ticket。", 403);
      const request = operation === "submit" ? ticketFieldSubmissionSchema.parse(input.payload) : ticketSubmissionReferenceSchema.parse(input.payload);
      if (request.expectedUserId !== session.masterUserId) throw new TicketSubmissionError("TICKET_ACCOUNT_CHANGED", "登录账号已变化，未发送旧账号的修改。", 409);
      const ref = { masterUserId: session.masterUserId, larkBaseUrl: session.baseUrl, baseId: request.baseId, tableId: request.tableId,
        recordId: z.string().trim().min(1).max(240).parse(input.recordId) };
      const data = operation === "submit" ? await service.submit({ ...ref, ...ticketFieldSubmissionSchema.parse(input.payload) })
        : operation === "snapshot" ? await service.snapshot(ref)
          : await service[operation](ref, z.string().uuid().parse(input.submissionId));
      return { statusCode: 200, body: { ok: true, data } };
    } catch (error) {
      const typed = toLarkTicketSourceError(error) ?? (error instanceof TicketSubmissionError || error instanceof LarkTicketError ? error : undefined);
      return { statusCode: error instanceof ZodError ? 400 : typed?.statusCode ?? 500, body: { ok: false, error: { ...diagnostics,
        errorCode: error instanceof ZodError ? "INVALID_REQUEST" : typed?.code ?? "TICKET_SUBMISSION_FAILED",
        errorMessage: error instanceof ZodError ? "Ticket 提交参数无效。" : typed?.message ?? "无法处理 Ticket 提交，请重新核对。",
      } } };
    }
  };
}

export function registerTicketFieldSubmissionRoutes(app: Express) {
  const controller = createTicketFieldSubmissionController();
  app.post("/api/web/lark-tickets/:recordId/field-submissions", async (req, res) => {
    const result = await controller("submit", { cookieHeader: req.headers.cookie, recordId: req.params.recordId, payload: req.body });
    res.setHeader("Cache-Control", "no-store"); res.status(result.statusCode).json(result.body);
  });
  app.get("/api/web/lark-tickets/:recordId/editable-fields", async (req, res) => {
    const result = await controller("snapshot", { cookieHeader: req.headers.cookie, recordId: req.params.recordId, payload: req.query });
    res.setHeader("Cache-Control", "no-store"); res.status(result.statusCode).json(result.body);
  });
  app.get("/api/web/lark-tickets/:recordId/field-submissions/:submissionId", async (req, res) => {
    const result = await controller("get", { cookieHeader: req.headers.cookie, recordId: req.params.recordId, submissionId: req.params.submissionId, payload: req.query });
    res.setHeader("Cache-Control", "no-store"); res.status(result.statusCode).json(result.body);
  });
  for (const [path, operation] of [["reconcile", "reconcile"], ["sync", "retrySync"]] as const) {
    app.post(`/api/web/lark-tickets/:recordId/field-submissions/:submissionId/${path}`, async (req, res) => {
      const result = await controller(operation, { cookieHeader: req.headers.cookie, recordId: req.params.recordId, submissionId: req.params.submissionId, payload: req.body });
      res.setHeader("Cache-Control", "no-store"); res.status(result.statusCode).json(result.body);
    });
  }
}
