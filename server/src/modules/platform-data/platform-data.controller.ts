import { ZodError } from "zod";
import { PlatformDataService, type PlatformDataKind } from "../../application/services/platform-data.service.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";
import { parsePlatformDataListResponse, platformDataListQuerySchema } from "./platform-data.dto.js";

type WebSessionResult = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;

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

export function createWebPlatformDataController(deps: {
  service?: Pick<PlatformDataService, "list">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
} = {}) {
  const service = deps.service ?? new PlatformDataService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;

  return async function listWebPlatformDataController(input: {
    kind: PlatformDataKind;
    cookieHeader: string | undefined;
    query: unknown;
  }) {
    const session = await ensureSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return {
        statusCode: 401,
        body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
      };
    }
    if (!getWebWorkspaceAccess(session.role).platformLists) {
      return {
        statusCode: 403,
        body: { ok: false as const, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权查看平台列表。" } },
      };
    }

    let query;
    try {
      query = platformDataListQuerySchema.parse(input.query);
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          statusCode: 400,
          body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } },
        };
      }
      throw error;
    }

    if (input.kind !== "meegle-workitems" && query.sprint) {
      return {
        statusCode: 400,
        body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: "Sprint 筛选仅适用于 Meegle 工作项。" } },
      };
    }

    try {
      const data = parsePlatformDataListResponse(input.kind, await service.list(input.kind, query.limit, { sprint: query.sprint }));
      return { statusCode: 200, body: { ok: true as const, data } };
    } catch {
      return {
        statusCode: 500,
        body: { ok: false as const, error: { errorCode: "PLATFORM_DATA_READ_FAILED", errorMessage: "无法读取同步数据。" } },
      };
    }
  };
}
