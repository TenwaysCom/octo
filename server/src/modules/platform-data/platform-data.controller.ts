import { ZodError } from "zod";
import { PlatformDataService, type PlatformDataKind } from "../../application/services/platform-data.service.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";
import {
  githubPullRequestPreviewQuerySchema,
  githubPullRequestPreviewResponseSchema,
  parsePlatformDataListResponse,
  platformDataListQuerySchema,
} from "./platform-data.dto.js";

type WebSessionResult = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

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

    const hasMeegleWorkitemFilters = query.sprint || query.project || query.workitemType || query.withoutSprint;
    if (input.kind !== "meegle-workitems" && hasMeegleWorkitemFilters) {
      return {
        statusCode: 400,
        body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: "Meegle 工作项筛选仅适用于 Meegle 工作项列表。" } },
      };
    }

    const hasLarkTicketFilters = query.createdAfter || query.createdBefore || query.issueType || query.responsible || query.quickFilter;
    if (input.kind !== "lark-tickets" && hasLarkTicketFilters) {
      return {
        statusCode: 400,
        body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: "Lark Ticket 筛选仅适用于 Lark Ticket 列表。" } },
      };
    }
    const hasGitHubPullRequestFilters = query.repo || query.label || query.reviewer;
    if (input.kind !== "github-pull-requests" && hasGitHubPullRequestFilters) {
      return {
        statusCode: 400,
        body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: "GitHub PR 筛选仅适用于 GitHub PR 列表。" } },
      };
    }
    if (input.kind === "github-pull-requests" && query.priority) {
      return {
        statusCode: 400,
        body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: "优先级筛选不适用于 GitHub PR 列表。" } },
      };
    }

    try {
      const filters = input.kind === "lark-tickets"
        ? { larkTickets: omitUndefined({
          createdAfter: query.createdAfter,
          createdBefore: query.createdBefore,
          sourceUpdatedAtAfter: query.sourceUpdatedAtAfter,
          sourceUpdatedAtBefore: query.sourceUpdatedAtBefore,
          issueTypes: query.issueType,
          statuses: query.status,
          priorities: query.priority,
          responsibles: query.responsible,
          quickFilter: query.quickFilter,
          offset: query.offset || undefined,
        }) }
        : input.kind === "meegle-workitems" ? { meegleWorkitems: omitUndefined({
          sprints: query.sprint,
          statuses: query.status,
          projects: query.project,
          priorities: query.priority,
          workitemTypes: query.workitemType,
          withoutSprint: query.withoutSprint || undefined,
          sourceUpdatedAtAfter: query.sourceUpdatedAtAfter,
          sourceUpdatedAtBefore: query.sourceUpdatedAtBefore,
          offset: query.offset || undefined,
        }) } : { githubPullRequests: omitUndefined({
          statuses: query.status,
          repositories: query.repo,
          labels: query.label,
          reviewers: query.reviewer,
          sourceUpdatedAtAfter: query.sourceUpdatedAtAfter,
          sourceUpdatedAtBefore: query.sourceUpdatedAtBefore,
          offset: query.offset || undefined,
        }) };
      const result = await service.list(input.kind, query.limit, filters);
      const hasMore = result.items.length > 0 && query.offset + result.items.length < result.total;
      const data = parsePlatformDataListResponse(input.kind, {
        ...result,
        pager: {
          offset: query.offset,
          limit: query.limit,
          total: result.total,
          hasMore,
          ...(hasMore ? { nextOffset: query.offset + result.items.length } : {}),
        },
      });
      return { statusCode: 200, body: { ok: true as const, data } };
    } catch {
      return {
        statusCode: 500,
        body: { ok: false as const, error: { errorCode: "PLATFORM_DATA_READ_FAILED", errorMessage: "无法读取同步数据。" } },
      };
    }
  };
}

export function createWebGitHubPullRequestPreviewController(deps: {
  service?: Pick<PlatformDataService, "getGitHubPullRequestPreview">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
} = {}) {
  const service = deps.service ?? new PlatformDataService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;

  return async function getWebGitHubPullRequestPreviewController(input: {
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

    const query = githubPullRequestPreviewQuerySchema.safeParse(input.query);
    if (!query.success) {
      return {
        statusCode: 400,
        body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: query.error.message } },
      };
    }

    try {
      const preview = await service.getGitHubPullRequestPreview(query.data);
      if (!preview) {
        return {
          statusCode: 404,
          body: { ok: false as const, error: { errorCode: "GITHUB_PULL_REQUEST_NOT_FOUND", errorMessage: "未找到 GitHub PR 同步快照。" } },
        };
      }
      return {
        statusCode: 200,
        body: { ok: true as const, data: githubPullRequestPreviewResponseSchema.parse(preview) },
      };
    } catch {
      return {
        statusCode: 500,
        body: { ok: false as const, error: { errorCode: "GITHUB_PULL_REQUEST_PREVIEW_FAILED", errorMessage: "无法读取 GitHub PR 预览。" } },
      };
    }
  };
}
