import { ZodError } from "zod";

import { OdooDevopsBranchesClientError } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import { OdooDevopsBranchesService } from "../../application/services/odoo-devops-branches.service.js";
import { ensureLarkWebSession } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { odooDevopsBranchesQuerySchema } from "./odoo-devops-branches.dto.js";

type WebSessionResult = Awaited<ReturnType<typeof ensureLarkWebSession>>;

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export function createWebOdooDevopsBranchesController(deps: {
  service: Pick<OdooDevopsBranchesService, "list">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
}) {
  const ensureSession = deps.ensureSession ?? ensureLarkWebSession;

  return async function getWebOdooDevopsBranches(input: { cookieHeader: string | undefined; query: unknown }) {
    const session = await ensureSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return {
        statusCode: 401,
        body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
      };
    }

    try {
      const query = odooDevopsBranchesQuerySchema.parse(input.query);
      const snapshot = await deps.service.list(query.environment);
      return { statusCode: 200, body: { ok: true as const, data: snapshot } };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          statusCode: 400,
          body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } },
        };
      }
      if (error instanceof OdooDevopsBranchesClientError) {
        return {
          statusCode: 503,
          body: {
            ok: false as const,
            error: { errorCode: error.code, errorMessage: "Odoo DevOps 分支状态暂时不可用。" },
          },
        };
      }
      return {
        statusCode: 502,
        body: {
          ok: false as const,
          error: { errorCode: "ODOO_DEVOPS_INVALID_RESPONSE", errorMessage: "Odoo DevOps 返回了无效的分支状态。" },
        },
      };
    }
  };
}
