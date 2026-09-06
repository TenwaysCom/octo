import { AcpRuntimeError } from "../../adapters/acp/acp-runtime.js";
import { AcpPermissionError } from "../../application/services/acp-permission.service.js";
import { acpPermissionErrorResponse } from "../acp-kimi/acp-permission.controller.js";
import type { Express, Request, Response } from "express";
import { z, ZodError } from "zod";
import {
  createLarkTicketAiSessionService,
  LarkTicketAiSessionError,
  type LarkTicketAiSessionRef,
} from "../../application/services/lark-ticket-ai-session.service.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import {
  resolveLarkWebSessionIdentity,
} from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { prepareAcpKimiEventStream, writeAcpKimiEvent } from "../acp-kimi/event-stream.js";
import { logger } from "../../logger.js";
import {
  createSupportTicketEffectDraftService,
  SupportTicketEffectDraftError,
} from "../../application/services/support-ticket-effect-draft.service.js";

const controllerLogger = logger.child({ module: "lark-ticket-ai-controller" });

const ticketRefSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  recordId: z.string().min(1),
});
const ticketSessionListQuerySchema = ticketRefSchema.omit({ recordId: true });
const ticketSessionChatSchema = ticketRefSchema.omit({ recordId: true }).extend({
  message: z.string().trim().min(1).max(8000),
  sessionId: z.string().min(1).optional(),
  actionKey: z.string().min(1).optional(),
  actionRunId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});
const ticketSessionLoadSchema = ticketRefSchema.omit({ recordId: true });
const ticketEffectDraftConfirmSchema = ticketSessionChatSchema.pick({ baseId: true, tableId: true }).extend({
  actionRunId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  confirmed: z.literal(true),
}).strict();

type WebIdentity = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof AcpPermissionError) return acpPermissionErrorResponse(error);
  if (error instanceof AcpRuntimeError) return { statusCode: 502, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message, layer: "adapter", module: "acp", stage: error.stage } } };
  if (error instanceof ZodError) {
    return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
  }
  if (error instanceof LarkTicketAiSessionError) {
    const statusCode = error.code === "DEEPSEEK_TIMEOUT" || error.code === "ZCODE_TIMEOUT"
      ? 504
      : error.code === "LARK_THREAD_CONTEXT_UNAVAILABLE" || error.code === "DEEPSEEK_API_KEY_MISSING" || error.code === "ZCODE_API_KEY_MISSING" || error.code === "TICKET_SUMMARY_PROVIDER_INVALID"
      ? 503
      : error.code === "DEEPSEEK_REQUEST_FAILED" || error.code === "DEEPSEEK_RESPONSE_INVALID" || error.code === "ZCODE_REQUEST_FAILED" || error.code === "ZCODE_RESPONSE_INVALID" || error.code === "TICKET_SUMMARY_OUTPUT_INVALID"
        ? 502
        : error.code === "TICKET_SUMMARY_EVIDENCE_OUTSIDE_SNAPSHOT" || error.code === "THREAD_SNAPSHOT_VERSION_CONFLICT"
          ? 409
      : error.code === "SUPPORT_QA_MATERIALS_UNAVAILABLE" || error.code === "SUPPORT_ANALYSIS_NOT_UPDATED"
        ? 502
        : error.code === "LARK_TICKET_NOT_FOUND" || error.code === "SESSION_NOT_FOUND"
          ? 404
          : error.code === "AI_ACTION_NOT_FOUND" || error.code === "SKILL_PROFILE_NOT_CONFIGURED"
            ? 400
            : 403;
    return {
      statusCode,
      body: {
        ok: false as const,
        error: {
          errorCode: error.code,
          errorMessage: error.message,
          ...(error.diagnostic ?? {}),
        },
      },
    };
  }
  return { statusCode: 500, body: { ok: false as const, error: { errorCode: "AI_SESSION_FAILED", errorMessage: "AI Session 暂时不可用。" } } };
}

export function createWebLarkTicketAiController(deps: {
  service?: ReturnType<typeof createLarkTicketAiSessionService>;
  resolveSession?: (sessionToken: string | undefined) => Promise<WebIdentity>;
  resolveOperatorLarkId?: (masterUserId: string) => Promise<string | undefined>;
  effectDraftService?: Pick<ReturnType<typeof createSupportTicketEffectDraftService>, "list" | "confirm">;
} = {}) {
  const service = deps.service ?? createLarkTicketAiSessionService();
  const resolveSession = deps.resolveSession ?? resolveLarkWebSessionIdentity;
  const resolveOperatorLarkId = deps.resolveOperatorLarkId ?? (async (masterUserId) => (await getResolvedUserStore().getById(masterUserId))?.larkId ?? undefined);
  const effectDraftService = deps.effectDraftService ?? createSupportTicketEffectDraftService();

  async function resolveIdentity(cookieHeader: string | undefined) {
    const session = await resolveSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return { ok: false as const, statusCode: 401, errorCode: session.errorCode, errorMessage: session.errorMessage };
    }
    const operatorLarkId = await resolveOperatorLarkId(session.masterUserId);
    if (!operatorLarkId) {
      return { ok: false as const, statusCode: 403, errorCode: "IDENTITY_NOT_FOUND", errorMessage: "当前 Web 会话没有可用的 Lark 身份。" };
    }
    return {
      ok: true as const,
      operatorLarkId,
      masterUserId: session.masterUserId,
      larkBaseUrl: session.baseUrl,
    };
  }

  return {
    async list(input: { cookieHeader: string | undefined; recordId: string; query: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const query = ticketSessionListQuerySchema.parse(input.query);
        const ticket = ticketRefSchema.parse({ ...query, recordId: input.recordId });
        return { statusCode: 200, body: { ok: true as const, data: { sessions: await service.listSessions({ operatorLarkId: identity.operatorLarkId, ticket }) } } };
      } catch (error) {
        return toErrorResponse(error);
      }
    },

    async load(input: { cookieHeader: string | undefined; recordId: string; sessionId: string; body: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const body = ticketSessionLoadSchema.parse(input.body);
        const ticket = ticketRefSchema.parse({ ...body, recordId: input.recordId });
        return { statusCode: 200, body: { ok: true as const, data: await service.loadSession({ operatorLarkId: identity.operatorLarkId, ticket, sessionId: input.sessionId }) } };
      } catch (error) {
        return toErrorResponse(error);
      }
    },

    async listEffectDrafts(input: { cookieHeader: string | undefined; recordId: string; query: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const query = ticketSessionListQuerySchema.parse(input.query);
        const ticket = ticketRefSchema.parse({ ...query, recordId: input.recordId });
        const data = await effectDraftService.list({ operatorLarkId: identity.operatorLarkId, ticket });
        return { statusCode: 200, body: { ok: true as const, data: { drafts: data } } };
      } catch (error) {
        return toEffectDraftErrorResponse(error);
      }
    },

    async confirmEffectDraft(input: { cookieHeader: string | undefined; recordId: string; draftId: string; body: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const body = ticketEffectDraftConfirmSchema.parse(input.body);
        const ticket = ticketRefSchema.parse({ ...body, recordId: input.recordId });
        const data = await effectDraftService.confirm({
          operatorLarkId: identity.operatorLarkId,
          masterUserId: identity.masterUserId,
          larkBaseUrl: identity.larkBaseUrl,
          ticket,
          draftId: input.draftId,
          actionRunId: body.actionRunId,
          confirmed: body.confirmed,
        });
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        return toEffectDraftErrorResponse(error);
      }
    },

    async chat(req: Request, res: Response) {
      const identity = await resolveIdentity(req.headers.cookie);
      if (!identity.ok) {
        res.status(identity.statusCode).json({ ok: false, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } });
        return;
      }
      let request: z.infer<typeof ticketSessionChatSchema>;
      let ticket: LarkTicketAiSessionRef;
      try {
        request = ticketSessionChatSchema.parse(req.body);
        ticket = ticketRefSchema.parse({ ...request, recordId: req.params.recordId });
      } catch (error) {
        const result = toErrorResponse(error);
        res.status(result.statusCode).json(result.body);
        return;
      }

      const abortController = new AbortController();
      const abort = () => abortController.abort();
      req.once("aborted", abort);
      res.once("close", abort);
      prepareAcpKimiEventStream(res);
      try {
        await service.chat({
          operatorLarkId: identity.operatorLarkId,
          masterUserId: identity.masterUserId,
          larkBaseUrl: identity.larkBaseUrl,
          ticket,
          message: request.message,
          sessionId: request.sessionId,
          actionKey: request.actionKey,
          actionRunId: request.actionRunId,
          signal: abortController.signal,
        }, (event) => writeAcpKimiEvent(res, event));
      } catch (error) {
        if (!abortController.signal.aborted && !res.writableEnded) {
          const result = toErrorResponse(error);
          controllerLogger.warn({ actionRunId: request.actionRunId, errorCode: result.body.error.errorCode }, "LARK_TICKET_AI_CHAT FAILED");
          res.write(`event: error\ndata: ${JSON.stringify(result.body.error)}\n\n`);
        }
      } finally {
        req.off("aborted", abort);
        res.off("close", abort);
        if (!res.writableEnded) res.end();
      }
    },
  };
}

export function registerWebLarkTicketAiRoutes(app: Express) {
  const controller = createWebLarkTicketAiController();
  app.get("/api/web/lark-tickets/:recordId/ai-sessions", async (req, res) => {
    const result = await controller.list({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, query: req.query });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/lark-tickets/:recordId/ai-sessions", (req, res) => controller.chat(req, res));
  app.post("/api/web/lark-tickets/:recordId/ai-sessions/:sessionId/load", async (req, res) => {
    const result = await controller.load({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, sessionId: req.params.sessionId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
  app.get("/api/web/lark-tickets/:recordId/effect-drafts", async (req, res) => {
    const result = await controller.listEffectDrafts({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, query: req.query });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/lark-tickets/:recordId/effect-drafts/:draftId/confirm", async (req, res) => {
    const result = await controller.confirmEffectDraft({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, draftId: req.params.draftId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
}

function toEffectDraftErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
  }
  if (error instanceof SupportTicketEffectDraftError) {
    const statusCode = error.code === "EFFECT_DRAFT_NOT_FOUND"
      ? 404
      : error.code === "EFFECT_DRAFT_FORBIDDEN"
        ? 403
        : error.code === "EFFECT_DRAFT_INVALID" || error.code === "EFFECT_SCHEMA_MISMATCH"
          ? 400
          : 409;
    return { statusCode, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message } } };
  }
  return toErrorResponse(error);
}
