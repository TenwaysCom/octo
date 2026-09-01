import type { Express } from "express";
import { z, ZodError } from "zod";
import {
  createLarkTicketService,
  LarkTicketError,
} from "../../application/services/lark-ticket.service.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import {
  createSupportTicketAnalysisService,
  SupportTicketAnalysisError,
} from "../../application/services/support-ticket-analysis.service.js";
import { supportAnalysisPayloadSchema } from "../../domain/support-ticket-analysis-update.js";
import { createLarkTicketEvalSampleSchema, updateLarkTicketEvalSampleSchema } from "../../domain/lark-ticket-eval-sample.js";
import { createLarkTicketEvalDatasetService, LarkTicketEvalDatasetError } from "../../application/services/lark-ticket-eval-dataset.service.js";

const ticketSharedUrlQuerySchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
});
const ticketSupportAnalysisUpdateSchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
  snapshotVersion: z.number().int().positive(),
  actionRunId: z.string().trim().min(1).max(128),
  reviewStatus: z.enum(["reviewed", "approved"]).default("reviewed"),
  ...supportAnalysisPayloadSchema.shape,
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

export function createWebLarkTicketController(deps: {
  service?: ReturnType<typeof createLarkTicketService>;
  analysisService?: ReturnType<typeof createSupportTicketAnalysisService>;
  evalDatasetService?: ReturnType<typeof createLarkTicketEvalDatasetService>;
  resolveSession?: (sessionToken: string | undefined) => Promise<WebIdentity>;
} = {}) {
  const service = deps.service ?? createLarkTicketService();
  const getAnalysisService = () => deps.analysisService ?? createSupportTicketAnalysisService();
  const getEvalDatasetService = () => deps.evalDatasetService ?? createLarkTicketEvalDatasetService();
  const resolveSession = deps.resolveSession ?? resolveLarkWebSessionIdentity;

  return {
    async loadSharedUrl(input: { cookieHeader: string | undefined; recordId: string; query: unknown }) {
      const session = await resolveSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
      if (!session.ok) {
        return { statusCode: 401, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      }
      try {
        const query = ticketSharedUrlQuerySchema.parse(input.query);
        const data = await service.loadSharedUrl({
          masterUserId: session.masterUserId,
          larkBaseUrl: session.baseUrl,
          ticket: { baseId: query.baseId, tableId: query.tableId, recordId: input.recordId },
        });
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        if (error instanceof ZodError) {
          return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        }
        if (error instanceof LarkTicketError) {
          return { statusCode: 404, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message } } };
        }
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "LARK_TICKET_SHARED_URL_LOAD_FAILED", errorMessage: "无法获取 Lark Ticket 详情链接。" } } };
      }
    },

    async updateSupportAnalysis(input: { cookieHeader: string | undefined; recordId: string; body: unknown }) {
      const session = await resolveSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
      if (!session.ok) {
        return { statusCode: 401, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      }
      try {
        const body = ticketSupportAnalysisUpdateSchema.parse(input.body);
        const data = await getAnalysisService().update({
          ticket: { baseId: body.baseId, tableId: body.tableId, recordId: input.recordId },
          snapshotVersion: body.snapshotVersion,
          actionRunId: body.actionRunId,
          sourceName: "server_ticket_api",
          reviewStatus: body.reviewStatus,
          reviewerKind: "human",
          analysis: {
            segmentKey: body.segmentKey,
            intent: body.intent,
            result: body.result,
            quality: body.quality,
          },
        });
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        if (error instanceof ZodError) {
          return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        }
        if (error instanceof SupportTicketAnalysisError) {
          const statusCode = error.code === "LARK_TICKET_NOT_FOUND" || error.code === "THREAD_SNAPSHOT_NOT_FOUND"
            ? 404
            : 409;
          return {
            statusCode,
            body: {
              ok: false as const,
              error: {
                layer: "server",
                module: "support-ticket-analysis",
                stage: "server.analysis.validate",
                errorCode: error.code,
                errorMessage: error.message,
                actionRunId: error.actionRunId,
              },
            },
          };
        }
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "SUPPORT_ANALYSIS_UPDATE_FAILED", errorMessage: "Ticket 分析结果暂时无法保存。" } } };
      }
    },

    async listEvalSamples(input: { cookieHeader: string | undefined }) {
      const session = await resolveSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
      if (!session.ok) return { statusCode: 401, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      try {
        return { statusCode: 200, body: { ok: true as const, data: { samples: await getEvalDatasetService().list() } } };
      } catch {
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "EVAL_SAMPLE_LIST_FAILED", errorMessage: "Eval 数据集暂时无法读取。" } } };
      }
    },

    async createEvalSample(input: { cookieHeader: string | undefined; recordId: string; body: unknown }) {
      const session = await resolveSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
      if (!session.ok) return { statusCode: 401, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      try {
        const body = createLarkTicketEvalSampleSchema.parse(input.body);
        const sample = await getEvalDatasetService().create({ ticket: { baseId: body.baseId, tableId: body.tableId, recordId: input.recordId }, actionRunId: body.actionRunId });
        return { statusCode: 200, body: { ok: true as const, data: { sample } } };
      } catch (error) { return evalDatasetErrorResponse(error); }
    },

    async updateEvalSample(input: { cookieHeader: string | undefined; sampleId: string; body: unknown }) {
      const session = await resolveSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
      if (!session.ok) return { statusCode: 401, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      try {
        const update = updateLarkTicketEvalSampleSchema.parse(input.body);
        const sample = await getEvalDatasetService().update({ id: input.sampleId, update });
        return { statusCode: 200, body: { ok: true as const, data: { sample } } };
      } catch (error) { return evalDatasetErrorResponse(error); }
    },
  };
}

function evalDatasetErrorResponse(error: unknown) {
  if (error instanceof ZodError) return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
  if (error instanceof LarkTicketEvalDatasetError) {
    const statusCode = error.code === "EVAL_SAMPLE_NOT_FOUND" || error.code === "LARK_TICKET_NOT_FOUND" || error.code === "THREAD_SNAPSHOT_NOT_FOUND" ? 404 : 409;
    return { statusCode, body: { ok: false as const, error: { layer: "server", module: "lark-ticket-eval-dataset", stage: "server.eval-dataset.validate", errorCode: error.code, errorMessage: error.message, actionRunId: error.actionRunId } } };
  }
  return { statusCode: 500, body: { ok: false as const, error: { errorCode: "LARK_TICKET_EVAL_SAMPLE_FAILED", errorMessage: "Eval 样本暂时无法保存。" } } };
}

export function registerWebLarkTicketRoutes(app: Express) {
  const controller = createWebLarkTicketController();
  app.get("/api/web/lark-tickets/:recordId/shared-url", async (req, res) => {
    const result = await controller.loadSharedUrl({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, query: req.query });
    res.status(result.statusCode).json(result.body);
  });
  app.put("/api/web/lark-tickets/:recordId/support-analysis", async (req, res) => {
    const result = await controller.updateSupportAnalysis({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
  app.get("/api/web/lark-ticket-eval-samples", async (req, res) => {
    const result = await controller.listEvalSamples({ cookieHeader: req.headers.cookie });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/lark-tickets/:recordId/eval-sample", async (req, res) => {
    const result = await controller.createEvalSample({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
  app.put("/api/web/lark-ticket-eval-samples/:sampleId", async (req, res) => {
    const result = await controller.updateEvalSample({ cookieHeader: req.headers.cookie, sampleId: req.params.sampleId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
}
