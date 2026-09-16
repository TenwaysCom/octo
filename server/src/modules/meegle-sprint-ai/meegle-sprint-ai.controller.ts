import { randomUUID } from "node:crypto";
import { AcpKimiProxyError } from "../../application/services/acp-kimi-proxy.service.js";
import { createWebAiSessionRuns, mergeWebAiSessions, WebAiRunError } from "../../application/services/web-ai-session-runs.js";
import type { AcpKimiStreamEvent } from "../acp-kimi/event-stream.js";
import { AcpRuntimeError } from "../../adapters/acp/acp-runtime.js";
import { AcpPermissionError } from "../../application/services/acp-permission.service.js";
import { acpPermissionErrorResponse } from "../acp-kimi/acp-permission.controller.js";
import type { Express, Request, Response } from "express";
import { z, ZodError } from "zod";
import {
  createMeegleSprintAiSessionService,
  MeegleSprintAiSessionError,
} from "../../application/services/meegle-sprint-ai-session.service.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";
import { prepareAcpKimiEventStream, writeAcpKimiEvent } from "../acp-kimi/event-stream.js";
import { logger } from "../../logger.js";

const controllerLogger = logger.child({ module: "meegle-sprint-ai-controller" });
const sprintRefSchema = z.object({ projectKey: z.string().min(1), sprintId: z.string().min(1) });
const sprintSessionChatSchema = sprintRefSchema.omit({ sprintId: true }).extend({
  message: z.string().trim().min(1).max(8000),
  sessionId: z.string().min(1).optional(),
  actionKey: z.string().min(1).optional(),
  actionRunId: z.string().min(1).optional(),
});
const sprintSessionLoadSchema = sprintRefSchema.omit({ sprintId: true });

type WebIdentity = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!value) return undefined;
  try { return decodeURIComponent(value.slice(name.length + 1)); } catch { return undefined; }
}

function toErrorResponse(error: unknown) {
  if (error instanceof AcpKimiProxyError) return { statusCode: error.statusCode, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message } } };
  if (error instanceof WebAiRunError) return { statusCode: error.statusCode, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message, layer: "server", module: "web-ai-session-runs", stage: "server.workflow.run" } } };
  if (error instanceof AcpPermissionError) return acpPermissionErrorResponse(error);
  if (error instanceof AcpRuntimeError) return { statusCode: 502, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message, layer: "adapter", module: "acp", stage: error.stage } } };
  if (error instanceof ZodError) return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
  if (error instanceof MeegleSprintAiSessionError) {
    const statusCode = error.code === "SPRINT_NOT_FOUND" || error.code === "SESSION_NOT_FOUND" ? 404
      : error.code === "AI_ACTION_NOT_FOUND" ? 400 : 403;
    return { statusCode, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message, ...(error.diagnostic ?? {}) } } };
  }
  return { statusCode: 500, body: { ok: false as const, error: { errorCode: "AI_SESSION_FAILED", errorMessage: "Sprint AI Session 暂时不可用。" } } };
}

export function createWebMeegleSprintAiController(deps: {
  service?: ReturnType<typeof createMeegleSprintAiSessionService>;
  runs?: ReturnType<typeof createWebAiSessionRuns>;
  resolveSession?: (sessionToken: string | undefined) => Promise<WebIdentity>;
  resolveOperatorLarkId?: (masterUserId: string) => Promise<string | undefined>;
} = {}) {
  const service = deps.service ?? createMeegleSprintAiSessionService();
  const runs = deps.runs ?? createWebAiSessionRuns();
  const resolveSession = deps.resolveSession ?? resolveLarkWebSessionIdentity;
  const resolveOperatorLarkId = deps.resolveOperatorLarkId ?? (async (masterUserId) => (await getResolvedUserStore().getById(masterUserId))?.larkId);

  async function resolveIdentity(cookieHeader: string | undefined) {
    const session = await resolveSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) return { ok: false as const, statusCode: 401, errorCode: session.errorCode, errorMessage: session.errorMessage };
    if (!getWebWorkspaceAccess(session.role).platformLists) return { ok: false as const, statusCode: 403, errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权查看平台列表。" };
    const operatorLarkId = await resolveOperatorLarkId(session.masterUserId);
    if (!operatorLarkId) return { ok: false as const, statusCode: 403, errorCode: "IDENTITY_NOT_FOUND", errorMessage: "当前 Web 会话没有可用的 Lark 身份。" };
    return { ok: true as const, operatorLarkId };
  }

  return {
    async list(input: { cookieHeader: string | undefined; sprintId: string; query: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const query = sprintSessionLoadSchema.parse(input.query);
        const sprint = sprintRefSchema.parse({ ...query, sprintId: input.sprintId });
        return { statusCode: 200, body: { ok: true as const, data: { sessions: mergeWebAiSessions(await service.listSessions({ operatorLarkId: identity.operatorLarkId, sprint }), runs.list({ operatorLarkId: identity.operatorLarkId, resource: JSON.stringify(["sprint", sprint.projectKey, sprint.sprintId]) })) } } };
      } catch (error) { return toErrorResponse(error); }
    },

    async load(input: { cookieHeader: string | undefined; sprintId: string; sessionId: string; body: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const request = sprintSessionLoadSchema.parse(input.body);
        const sprint = sprintRefSchema.parse({ ...request, sprintId: input.sprintId });
        return { statusCode: 200, body: { ok: true as const, data: runs.load({ operatorLarkId: identity.operatorLarkId, resource: JSON.stringify(["sprint", sprint.projectKey, sprint.sprintId]) }, input.sessionId) ?? await service.loadSession({ operatorLarkId: identity.operatorLarkId, sprint, sessionId: input.sessionId }) } };
      } catch (error) { return toErrorResponse(error); }
    },

    async stop(input: { cookieHeader: string | undefined; sprintId: string; sessionId: string; body: unknown }) {
      const identity = await resolveIdentity(input.cookieHeader);
      if (!identity.ok) return { statusCode: identity.statusCode, body: { ok: false as const, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } } };
      try {
        const body = sprintSessionLoadSchema.extend({ runId: z.string().min(1) }).strict().parse(input.body);
        const sprint = sprintRefSchema.parse({ ...body, sprintId: input.sprintId });
        return { statusCode: 200, body: { ok: true as const, data: runs.stop({ operatorLarkId: identity.operatorLarkId, resource: JSON.stringify(["sprint", sprint.projectKey, sprint.sprintId]) }, input.sessionId, body.runId) } };
      } catch (error) { return toErrorResponse(error); }
    },

    async chat(req: Request, res: Response) {
      const identity = await resolveIdentity(req.headers.cookie);
      if (!identity.ok) { res.status(identity.statusCode).json({ ok: false, error: { errorCode: identity.errorCode, errorMessage: identity.errorMessage } }); return; }
      let request: z.infer<typeof sprintSessionChatSchema>;
      let sprint: z.infer<typeof sprintRefSchema>;
      try {
        request = sprintSessionChatSchema.parse(req.body);
        sprint = sprintRefSchema.parse({ ...request, sprintId: req.params.sprintId });
      } catch (error) { const result = toErrorResponse(error); res.status(result.statusCode).json(result.body); return; }
      request.actionRunId ??= randomUUID();
      const scope = { operatorLarkId: identity.operatorLarkId, resource: JSON.stringify(["sprint", sprint.projectKey, sprint.sprintId]) };
      // A disconnected response only detaches this observer, never the run.
      let connected = true;
      const detach = () => { connected = false; };
      req.once("aborted", detach);
      res.once("close", detach);
      const emit = (event: AcpKimiStreamEvent) => {
        if (connected && !res.writableEnded && !res.destroyed) {
          try { writeAcpKimiEvent(res, event); } catch { detach(); }
        }
      };
      prepareAcpKimiEventStream(res);
      try {
        await runs.execute({ ...scope, sessionId: request.sessionId, message: request.message,
          actionKey: request.actionKey, actionRunId: request.actionRunId, oneShot: false }, {
          loadHistory: async () => await service.loadSession({ operatorLarkId: identity.operatorLarkId, sprint, sessionId: request.sessionId! }) as { events: AcpKimiStreamEvent[] },
          chat: (signal, emit, actionRunId) => service.chat({
            operatorLarkId: identity.operatorLarkId, sprint, message: request.message,
            sessionId: request.sessionId, actionKey: request.actionKey, actionRunId, signal,
          }, emit),
          emit,
        });
      } catch (error) {
        const result = toErrorResponse(error);
        controllerLogger.warn({ layer: "server", stage: "server.workflow.completed", actionRunId: request.actionRunId, errorCode: result.body.error.errorCode }, "MEEGLE_SPRINT_AI_CHAT_FAILED");
        if (connected && !res.writableEnded && !res.destroyed) res.write(`event: error\ndata: ${JSON.stringify(result.body.error)}\n\n`);
      } finally {
        req.off("aborted", detach);
        res.off("close", detach);
        if (connected && !res.writableEnded && !res.destroyed) res.end();
      }
    },
  };
}

export function registerWebMeegleSprintAiRoutes(app: Express) {
  const controller = createWebMeegleSprintAiController();
  app.get("/api/web/meegle-sprints/:sprintId/ai-sessions", async (req, res) => {
    const result = await controller.list({ cookieHeader: req.headers.cookie, sprintId: req.params.sprintId, query: req.query });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/meegle-sprints/:sprintId/ai-sessions", (req, res) => controller.chat(req, res));
  app.post("/api/web/meegle-sprints/:sprintId/ai-sessions/:sessionId/stop", async (req, res) => {
    const result = await controller.stop({ cookieHeader: req.headers.cookie, sprintId: req.params.sprintId, sessionId: req.params.sessionId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/meegle-sprints/:sprintId/ai-sessions/:sessionId/load", async (req, res) => {
    const result = await controller.load({ cookieHeader: req.headers.cookie, sprintId: req.params.sprintId, sessionId: req.params.sessionId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
}
