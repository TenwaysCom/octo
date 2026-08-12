import type { Express } from "express";
import { z, ZodError } from "zod";
import {
  createLarkTicketService,
  LarkTicketError,
} from "../../application/services/lark-ticket.service.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";

const ticketSharedUrlQuerySchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
});

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
  resolveSession?: (sessionToken: string | undefined) => Promise<WebIdentity>;
} = {}) {
  const service = deps.service ?? createLarkTicketService();
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
  };
}

export function registerWebLarkTicketRoutes(app: Express) {
  const controller = createWebLarkTicketController();
  app.get("/api/web/lark-tickets/:recordId/shared-url", async (req, res) => {
    const result = await controller.loadSharedUrl({ cookieHeader: req.headers.cookie, recordId: req.params.recordId, query: req.query });
    res.status(result.statusCode).json(result.body);
  });
}
