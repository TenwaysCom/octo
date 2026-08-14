import type { Express, Request } from "express";
import { z, ZodError } from "zod";
import { pickLarkTicketAiFields } from "../../domain/lark-ticket-ai.js";
import { logger } from "../../logger.js";
import { PostgresUserSshPublicKeyStore, type UserSshPublicKeyStore } from "../../adapters/postgres/user-ssh-public-key-store.js";
import {
  createInternalSignedRequestAuth,
  InternalSignedRequestAuthError,
  type InternalSignedRequestAuthInput,
} from "../../http/internal-signed-request-auth.js";
import {
  createLarkTicketAiWriteService,
  LarkTicketAiWriteError,
} from "./lark-ticket-ai-write.service.js";

const controllerLogger = logger.child({ module: "internal-lark-ticket-ai-write" });
const MODULE = "internal-lark-ticket-ai-write";

const updateSchema = z.object({
  version: z.literal("support-qa-lark-update-v1"),
  record_id: z.string().regex(/^rec[\w-]+$/),
  ticket_no: z.string().trim().min(1).optional(),
  actionRunId: z.string().trim().min(1).max(128).optional(),
  fields: z.record(z.string(), z.unknown()).refine((fields) => Object.keys(pickLarkTicketAiFields(fields)).length > 0, {
    message: "The update does not contain a supported Ticket AI field.",
  }),
});

type Authorizer = ReturnType<typeof createInternalSignedRequestAuth>;
type WriteService = ReturnType<typeof createLarkTicketAiWriteService>;

function toErrorResponse(error: unknown, actionRunId?: string) {
  const statusCode = error instanceof InternalSignedRequestAuthError
    ? error.statusCode
    : error instanceof ZodError
      ? 400
      : error instanceof LarkTicketAiWriteError
        ? 404
        : 500;
  const errorCode = error instanceof InternalSignedRequestAuthError || error instanceof LarkTicketAiWriteError
    ? error.code
    : error instanceof ZodError
      ? "INVALID_REQUEST"
      : "INTERNAL_TICKET_AI_WRITE_FAILED";
  const errorMessage = error instanceof ZodError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Internal Ticket AI update failed.";
  return {
    statusCode,
    body: {
      ok: false as const,
      error: {
        layer: "server" as const,
        module: MODULE,
        stage: error instanceof InternalSignedRequestAuthError ? "server.auth.checked" : "server.workflow.failed",
        errorCode,
        errorMessage,
        ...(actionRunId ? { actionRunId } : {}),
      },
    },
  };
}

function getRawBody(req: Request): Buffer | undefined {
  const rawBody = (req as Request & { rawBody?: unknown }).rawBody;
  return Buffer.isBuffer(rawBody) ? rawBody : undefined;
}

export function createInternalLarkTicketAiWriteController(deps: {
  authorizer?: Pick<Authorizer, "authorize">;
  service?: Pick<WriteService, "update">;
  userSshPublicKeyStore?: UserSshPublicKeyStore;
} = {}) {
  const getUserSshPublicKeyStore = () => deps.userSshPublicKeyStore ?? new PostgresUserSshPublicKeyStore();
  const authorizer = deps.authorizer ?? createInternalSignedRequestAuth({
    signatureNamespace: "octo-ticket-ai",
    method: "POST",
    path: "/api/internal/lark-ticket-ai",
    headerPrefix: "x-octo-ticket-ai",
    allowedCidrs: process.env.OCTO_TICKET_AI_ALLOWED_CIDRS,
    resolveSigningKey: async (publicKeyFingerprint) => {
      const signingKey = await getUserSshPublicKeyStore().getActiveByPublicKeyFingerprint(publicKeyFingerprint);
      return signingKey
        ? { principalId: signingKey.masterUserId, publicKey: signingKey.publicKey }
        : undefined;
    },
  });
  const service = deps.service ?? createLarkTicketAiWriteService();

  return {
    async update(req: Request) {
      let request: z.infer<typeof updateSchema> | undefined;
      try {
        const authorization = await authorizer.authorize({
          remoteAddress: req.socket.remoteAddress,
          headers: req.headers as InternalSignedRequestAuthInput["headers"],
          rawBody: getRawBody(req),
        });
        request = updateSchema.parse(req.body);
        const data = await service.update({ recordId: request.record_id, fields: pickLarkTicketAiFields(request.fields) });
        controllerLogger.info({ actionRunId: request.actionRunId, recordId: request.record_id, authorizedUserId: authorization.principalId, signingKeyFingerprint: authorization.publicKeyFingerprint, updated: data.updated, layer: "server", stage: "server.workflow.completed" }, "INTERNAL_LARK_TICKET_AI_UPDATED");
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        const result = toErrorResponse(error, request?.actionRunId);
        controllerLogger.warn({ actionRunId: request?.actionRunId, errorCode: result.body.error.errorCode, layer: "server", stage: result.body.error.stage }, "INTERNAL_LARK_TICKET_AI_UPDATE_FAILED");
        return result;
      }
    },
  };
}

export function registerInternalLarkTicketAiWriteRoutes(app: Express) {
  const controller = createInternalLarkTicketAiWriteController();
  app.post("/api/internal/lark-ticket-ai", async (req, res) => {
    const result = await controller.update(req);
    res.status(result.statusCode).json(result.body);
  });
}
