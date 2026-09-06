import type { Express } from "express";
import { ZodError } from "zod";
import { acpPermissionReplySchema } from "./acp-kimi.dto.js";
import { acpPermissionService, AcpPermissionError } from "../../application/services/acp-permission.service.js";
import { getAcpKimiSessionOwnershipStore } from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";

export function acpPermissionErrorResponse(error: AcpPermissionError) {
  return { statusCode: error.statusCode, body: { ok: false as const, error: {
    errorCode: error.code, errorMessage: error.message,
    layer: "server", module: "acp-permission", stage: error.stage,
    ...(error.actionRunId ? { actionRunId: error.actionRunId } : {}),
  } } };
}

export function createAcpPermissionController(deps: {
  service?: Pick<typeof acpPermissionService, "reply">;
  resolveSession?: typeof resolveLarkWebSessionIdentity;
  resolveOperatorLarkId?: (id: string) => Promise<string | undefined>;
  ownershipStore?: Pick<ReturnType<typeof getAcpKimiSessionOwnershipStore>, "getBySessionId">;
} = {}) {
  const service = deps.service ?? acpPermissionService;
  const resolveSession = deps.resolveSession ?? resolveLarkWebSessionIdentity;
  const resolveOperator = deps.resolveOperatorLarkId ?? (async (id) => (await getResolvedUserStore().getById(id))?.larkId ?? undefined);
  const store = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  return {
    async reply(input: { cookieHeader?: string; body: unknown }) {
      try {
        const raw = input.cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${WEB_SESSION_COOKIE_NAME}=`));
        let token: string | undefined;
        try { token = raw ? decodeURIComponent(raw.slice(WEB_SESSION_COOKIE_NAME.length + 1)) : undefined; } catch { /* Invalid cookie is unauthenticated. */ }
        const session = await resolveSession(token);
        if (!session.ok) throw new AcpPermissionError(session.errorCode, session.errorMessage, 401);
        const operatorLarkId = await resolveOperator(session.masterUserId);
        if (!operatorLarkId) throw new AcpPermissionError("IDENTITY_NOT_FOUND", "当前会话没有可用的 Lark 身份。", 403);
        const request = acpPermissionReplySchema.parse(input.body);
        const owner = await store.getBySessionId(request.sessionId);
        if (!owner || owner.deletedAt || owner.operatorLarkId !== operatorLarkId) {
          throw new AcpPermissionError("ACP_PERMISSION_FORBIDDEN", "会话不属于当前用户或已删除。", 403);
        }
        const data = service.reply({ ...request, operatorLarkId });
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        if (error instanceof ZodError) return acpPermissionErrorResponse(new AcpPermissionError("INVALID_REQUEST", "审批回复格式不正确。", 400));
        if (error instanceof AcpPermissionError) return acpPermissionErrorResponse(error);
        return acpPermissionErrorResponse(new AcpPermissionError("ACP_PERMISSION_REPLY_FAILED", "审批回复暂时不可用。", 500));
      }
    },
  };
}

export function registerWebAcpPermissionRoutes(app: Express) {
  const controller = createAcpPermissionController();
  app.post("/api/web/acp/permissions/reply", async (req, res) => {
    const result = await controller.reply({ cookieHeader: req.headers.cookie, body: req.body });
    res.status(result.statusCode).json(result.body);
  });
}
