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
import {
  createLarkTicketMeegleWorkitem,
  type LarkTicketFieldUpdateDeps,
  getLarkTicketFieldOptions,
  LarkTicketFieldUpdateError,
  updateLarkTicketField,
} from "../../application/services/lark-ticket-field-update.service.js";
import { executeLarkBaseWorkflow } from "../lark-base/lark-base-workflow.service.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";
import { PostgresLarkTicketThreadSyncStore, type LarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";

const ticketSharedUrlQuerySchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
});
const ticketFieldOptionsQuerySchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
});
const ticketFieldUpdateSchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
  field: z.enum(["status", "responsible", "requester", "priority", "issueType", "businessLine"]),
  value: z.string().trim().min(1).max(512),
  optionUserId: z.string().trim().min(1).max(128).optional(),
  actionRunId: z.string().trim().min(1).max(128),
}).strict();
const ticketCreateMeegleSchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
  actionRunId: z.string().trim().min(1).max(128),
}).strict();
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
  threadStore?: Pick<LarkTicketThreadSyncStore, "get">;
  resolveSession?: (sessionToken: string | undefined) => Promise<WebIdentity>;
  fieldUpdateService?: {
    update: typeof updateLarkTicketField;
    loadOptions: typeof getLarkTicketFieldOptions;
  };
  createMeegleWorkflow?: typeof executeLarkBaseWorkflow;
  syncLarkBaseTicket?: LarkTicketFieldUpdateDeps["syncLarkBaseTicket"];
} = {}) {
  const service = deps.service ?? createLarkTicketService();
  const getAnalysisService = () => deps.analysisService ?? createSupportTicketAnalysisService();
  const getEvalDatasetService = () => deps.evalDatasetService ?? createLarkTicketEvalDatasetService();
  const getThreadStore = () => deps.threadStore ?? new PostgresLarkTicketThreadSyncStore();
  const resolveSession = deps.resolveSession ?? resolveLarkWebSessionIdentity;
  const getFieldUpdateService = () => deps.fieldUpdateService ?? {
    update: updateLarkTicketField,
    loadOptions: getLarkTicketFieldOptions,
  };

  const resolveTicketWriteSession = async (cookieHeader: string | undefined) => {
    const session = await resolveSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return { ok: false as const, response: { statusCode: 401 as const, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } } };
    }
    if (!getWebWorkspaceAccess(session.role).platformSync) {
      return { ok: false as const, response: { statusCode: 403 as const, body: { ok: false as const, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权操作平台数据。" } } } };
    }
    return { ok: true as const, session };
  };

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

    async loadPreparedMessages(input: { cookieHeader: string | undefined; recordId: string; query: unknown }) {
      const session = await resolveSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
      if (!session.ok) return { statusCode: 401, body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } } };
      try {
        const query = ticketSharedUrlQuerySchema.parse(input.query);
        const snapshot = await getThreadStore().get({ baseId: query.baseId, tableId: query.tableId, recordId: input.recordId });
        if (!snapshot) return { statusCode: 404, body: { ok: false as const, error: { errorCode: "THREAD_SNAPSHOT_NOT_FOUND", errorMessage: "Ticket 尚未准备线程消息。" } } };
        return { statusCode: 200, body: { ok: true as const, data: { threadId: snapshot.threadId, messageLink: snapshot.messageLink, snapshotVersion: snapshot.snapshotVersion, historyComplete: snapshot.historyComplete, messages: snapshot.preparedMessages } } };
      } catch (error) {
        if (error instanceof ZodError) return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "PREPARED_MESSAGES_LOAD_FAILED", errorMessage: "Prepared messages 暂时无法读取。" } } };
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

    async updateTicketField(input: { cookieHeader: string | undefined; recordId: string; body: unknown }) {
      const auth = await resolveTicketWriteSession(input.cookieHeader);
      if (!auth.ok) return auth.response;
      const session = auth.session;
      try {
        const body = ticketFieldUpdateSchema.parse(input.body);
        const result = await getFieldUpdateService().update({
          masterUserId: session.masterUserId,
          larkBaseUrl: session.baseUrl,
          baseId: body.baseId,
          tableId: body.tableId,
          recordId: input.recordId,
          field: body.field,
          value: body.value,
          optionUserId: body.optionUserId,
          actionRunId: body.actionRunId,
        });
        if (!result.ok) {
          return { statusCode: fieldUpdateErrorStatusCode(result.error.errorCode), body: { ok: false as const, error: result.error } };
        }
        return { statusCode: 200, body: { ok: true as const, data: result } };
      } catch (error) {
        if (error instanceof ZodError) return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "LARK_TICKET_FIELD_UPDATE_FAILED", errorMessage: "Ticket 字段更新失败，请稍后重试。" } } };
      }
    },

    async createTicketMeegleWorkitem(input: { cookieHeader: string | undefined; recordId: string; body: unknown }) {
      const auth = await resolveTicketWriteSession(input.cookieHeader);
      if (!auth.ok) return auth.response;
      const session = auth.session;
      try {
        const body = ticketCreateMeegleSchema.parse(input.body);
        const result = await createLarkTicketMeegleWorkitem({
          larkBaseUrl: session.baseUrl,
          cleanAfterSync: true,
          recordId: input.recordId,
          masterUserId: session.masterUserId,
          baseId: body.baseId,
          tableId: body.tableId,
          actionRunId: body.actionRunId,
        }, deps);
        if (!result.ok) {
          return { statusCode: createMeegleErrorStatusCode(result.error.errorCode), body: { ok: false as const, error: result.error } };
        }
        return { statusCode: 200, body: { ok: true as const, data: {
          actionRunId: body.actionRunId,
          workitemId: result.workitemId,
          meegleLink: result.meegleLink,
          workitems: result.workitems,
          syncFailed: result.syncFailed,
        } } };
      } catch (error) {
        if (error instanceof ZodError) return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "LARK_TICKET_CREATE_MEEGLE_FAILED", errorMessage: "创建 Meegle 工作项失败，请稍后重试。" } } };
      }
    },

    async loadTicketFieldOptions(input: { cookieHeader: string | undefined; query: unknown }) {
      const auth = await resolveTicketWriteSession(input.cookieHeader);
      if (!auth.ok) return auth.response;
      const session = auth.session;
      try {
        const query = ticketFieldOptionsQuerySchema.parse(input.query);
        const data = await getFieldUpdateService().loadOptions({
          masterUserId: session.masterUserId,
          larkBaseUrl: session.baseUrl,
          baseId: query.baseId,
          tableId: query.tableId,
        });
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        if (error instanceof ZodError) return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        if (error instanceof LarkTicketFieldUpdateError) {
          return { statusCode: 502, body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message } } };
        }
        return { statusCode: 500, body: { ok: false as const, error: { errorCode: "LARK_TICKET_FIELD_OPTIONS_FAILED", errorMessage: "Ticket 字段选项暂时无法读取。" } } };
      }
    },
  };
}

function fieldUpdateErrorStatusCode(errorCode: string): number {
  if (errorCode === "LARK_TICKET_FIELD_NOT_FOUND") return 404;
  if (errorCode === "LARK_TICKET_USER_ID_REQUIRED") return 400;
  if (errorCode === "LARK_AUTH_REQUIRED") return 401;
  return 502;
}

function createMeegleErrorStatusCode(errorCode: string): number {
  if (errorCode === "LARK_TICKET_CREATE_RUNNING") return 409;
  if (errorCode === "MEEGLE_LINK_ALREADY_EXISTS") return 409;
  if (errorCode === "INVALID_REQUEST" || errorCode === "UNKNOWN_ISSUE_TYPE") return 400;
  return 502;
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
  app.get("/api/web/lark-tickets/field-options", async (req, res) => {
    const result = await controller.loadTicketFieldOptions({ cookieHeader: req.headers.cookie, query: req.query });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/lark-tickets/:recordId/fields", async (req, res) => {
    const result = await controller.updateTicketField({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
  app.post("/api/web/lark-tickets/:recordId/create-meegle-workitem", async (req, res) => {
    const result = await controller.createTicketMeegleWorkitem({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
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
  app.get("/api/web/lark-tickets/:recordId/prepared-messages", async (req, res) => {
    const result = await controller.loadPreparedMessages({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, query: req.query });
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
