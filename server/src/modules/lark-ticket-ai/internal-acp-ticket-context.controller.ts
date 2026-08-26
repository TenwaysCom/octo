import type { Express, Request } from "express";
import { z, ZodError } from "zod";
import {
  AcpTicketThreadContextError,
  createAcpTicketThreadContextService,
  type AcpTicketThreadContextService,
} from "../../application/services/acp-ticket-thread-context.service.js";
import { LarkTicketThreadContextError } from "../../application/services/lark-ticket-thread-context.service.js";
import {
  PostgresUserSshPublicKeyStore,
  type UserSshPublicKeyStore,
} from "../../adapters/postgres/user-ssh-public-key-store.js";
import {
  createInternalSignedRequestAuth,
  InternalSignedRequestAuthError,
  type InternalSignedRequestAuthInput,
} from "../../http/internal-signed-request-auth.js";
import { logger } from "../../logger.js";

const MODULE = "internal-acp-ticket-context";
const PATH = "/api/internal/acp/ticket-context/messages";
const controllerLogger = logger.child({ module: MODULE });

const requestSchema = z.object({
  version: z.literal("ticket-thread-context-v1"),
  base_id: z.string().trim().min(1).max(128),
  table_id: z.string().trim().min(1).max(128),
  record_id: z.string().trim().min(1).max(128),
  lark_base_url: z.string().url().refine((value) => new URL(value).protocol === "https:", {
    message: "lark_base_url must use HTTPS.",
  }),
  actionRunId: z.string().trim().min(1).max(128).optional(),
});

type Authorizer = ReturnType<typeof createInternalSignedRequestAuth>;

function getRawBody(req: Request): Buffer | undefined {
  const rawBody = (req as Request & { rawBody?: unknown }).rawBody;
  return Buffer.isBuffer(rawBody) ? rawBody : undefined;
}

function toErrorResponse(error: unknown, actionRunId?: string) {
  const statusCode = error instanceof InternalSignedRequestAuthError
    ? error.statusCode
    : error instanceof ZodError
      ? 400
      : error instanceof AcpTicketThreadContextError
        ? 404
        : error instanceof LarkTicketThreadContextError
          ? 503
          : 500;
  const errorCode = error instanceof InternalSignedRequestAuthError
    || error instanceof AcpTicketThreadContextError
    || error instanceof LarkTicketThreadContextError
    ? error.code
    : error instanceof ZodError
      ? "INVALID_REQUEST"
      : "ACP_TICKET_CONTEXT_FAILED";
  return {
    statusCode,
    body: {
      ok: false as const,
      error: {
        layer: "server" as const,
        module: MODULE,
        stage: error instanceof InternalSignedRequestAuthError
          ? "server.auth.checked"
          : "server.workflow.failed",
        errorCode,
        errorMessage: error instanceof Error ? error.message : "Ticket thread context is unavailable.",
        ...(actionRunId ? { actionRunId } : {}),
      },
    },
  };
}

export function createInternalAcpTicketContextController(deps: {
  authorizer?: Pick<Authorizer, "authorize">;
  service?: Pick<AcpTicketThreadContextService, "getMessages">;
  userSshPublicKeyStore?: UserSshPublicKeyStore;
} = {}) {
  const getUserSshPublicKeyStore = () => deps.userSshPublicKeyStore ?? new PostgresUserSshPublicKeyStore();
  const authorizer = deps.authorizer ?? createInternalSignedRequestAuth({
    signatureNamespace: "octo-acp-ticket-context",
    method: "POST",
    path: PATH,
    headerPrefix: "x-octo-acp-context",
    allowedCidrs: process.env.OCTO_ACP_TICKET_CONTEXT_ALLOWED_CIDRS ?? process.env.OCTO_TICKET_AI_ALLOWED_CIDRS,
    resolveSigningKey: async (publicKeyFingerprint) => {
      const signingKey = await getUserSshPublicKeyStore().getActiveByPublicKeyFingerprint(publicKeyFingerprint);
      return signingKey
        ? { principalId: signingKey.masterUserId, publicKey: signingKey.publicKey }
        : undefined;
    },
  });
  const service = deps.service ?? createAcpTicketThreadContextService();

  return {
    async getMessages(req: Request) {
      let request: z.infer<typeof requestSchema> | undefined;
      try {
        const authorization = await authorizer.authorize({
          remoteAddress: req.socket.remoteAddress,
          headers: req.headers as InternalSignedRequestAuthInput["headers"],
          rawBody: getRawBody(req),
        });
        request = requestSchema.parse(req.body);
        const data = await service.getMessages({
          masterUserId: authorization.principalId,
          larkBaseUrl: request.lark_base_url,
          ticket: {
            baseId: request.base_id,
            tableId: request.table_id,
            recordId: request.record_id,
          },
        });
        controllerLogger.info({
          actionRunId: request.actionRunId,
          recordId: request.record_id,
          authorizedUserId: authorization.principalId,
          signingKeyFingerprint: authorization.publicKeyFingerprint,
          decision: data.decision,
          source: data.source,
          snapshotVersion: data.snapshotVersion,
          messageCount: data.messages.length,
          layer: "server",
          stage: "server.workflow.completed",
        }, "INTERNAL_ACP_TICKET_CONTEXT_COMPLETED");
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        const result = toErrorResponse(error, request?.actionRunId);
        controllerLogger.warn({
          actionRunId: request?.actionRunId,
          errorCode: result.body.error.errorCode,
          layer: "server",
          stage: result.body.error.stage,
        }, "INTERNAL_ACP_TICKET_CONTEXT_FAILED");
        return result;
      }
    },
  };
}

export function registerInternalAcpTicketContextRoutes(app: Express) {
  const controller = createInternalAcpTicketContextController();
  app.post(PATH, async (req, res) => {
    const result = await controller.getMessages(req);
    res.status(result.statusCode).json(result.body);
  });
}
