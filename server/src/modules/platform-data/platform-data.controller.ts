import { ZodError } from "zod";
import { PlatformDataService, type PlatformDataKind } from "../../application/services/platform-data.service.js";
import {
  MeeglePullRequestLinkError,
  MeeglePullRequestLinkService,
} from "../../application/services/meegle-pull-request-link.service.js";
import { createActionErrorEnvelopeFromError, getActionRunId } from "../../application/action-error-envelope.js";
import { logger } from "../../logger.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";
import {
  githubPullRequestPreviewQuerySchema,
  githubPullRequestPreviewResponseSchema,
  linkMeeglePullRequestBodySchema,
  linkMeeglePullRequestResponseSchema,
  meeglePullRequestCandidatesQuerySchema,
  meeglePullRequestCandidatesResponseSchema,
  meegleSprintHistoryResponseSchema,
  parsePlatformDataListResponse,
  platformDataListQuerySchema,
} from "./platform-data.dto.js";

type WebSessionResult = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;
const controllerLogger = logger.child({ module: "meegle-pull-request-link" });

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

export function createWebMeegleSprintHistoryController(deps: {
  service?: Pick<PlatformDataService, "listMeegleSprintHistory">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
} = {}) {
  const service = deps.service ?? new PlatformDataService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;

  return async function listWebMeegleSprintHistoryController(input: { cookieHeader: string | undefined }) {
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

    try {
      const data = meegleSprintHistoryResponseSchema.parse(await service.listMeegleSprintHistory());
      return { statusCode: 200, body: { ok: true as const, data } };
    } catch {
      return {
        statusCode: 500,
        body: { ok: false as const, error: { errorCode: "MEEGLE_SPRINT_HISTORY_READ_FAILED", errorMessage: "无法读取 Sprint 历史。" } },
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

export function createWebMeeglePullRequestLinkController(deps: {
  service?: Pick<MeeglePullRequestLinkService, "listCandidates" | "link">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
} = {}) {
  const service = deps.service ?? new MeeglePullRequestLinkService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;

  async function authorize(cookieHeader: string | undefined) {
    const session = await ensureSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return {
        statusCode: 401,
        body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
      };
    }
    if (!getWebWorkspaceAccess(session.role).platformLists) {
      return {
        statusCode: 403,
        body: { ok: false as const, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权操作平台列表。" } },
      };
    }
    return undefined;
  }

  return {
    async listCandidates(input: { cookieHeader: string | undefined; query: unknown }) {
      const unauthorized = await authorize(input.cookieHeader);
      if (unauthorized) return unauthorized;
      const query = meeglePullRequestCandidatesQuerySchema.safeParse(input.query);
      if (!query.success) {
        return {
          statusCode: 400,
          body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: query.error.message } },
        };
      }
      try {
        const data = meeglePullRequestCandidatesResponseSchema.parse(await service.listCandidates(query.data));
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        if (error instanceof MeeglePullRequestLinkError) {
          return {
            statusCode: error.statusCode,
            body: { ok: false as const, error: { errorCode: error.code, errorMessage: error.message } },
          };
        }
        return {
          statusCode: 500,
          body: { ok: false as const, error: { errorCode: "MEEGLE_PULL_REQUEST_CANDIDATES_FAILED", errorMessage: "无法读取候选 GitHub PR。" } },
        };
      }
    },

    async link(input: { cookieHeader: string | undefined; body: unknown }) {
      const unauthorized = await authorize(input.cookieHeader);
      if (unauthorized) return unauthorized;
      const request = linkMeeglePullRequestBodySchema.safeParse(input.body);
      if (!request.success) {
        return {
          statusCode: 400,
          body: {
            ok: false as const,
            error: createActionErrorEnvelopeFromError(request.error, {
              module: "meegle-pull-request-link",
              stage: "server.action.received",
              errorCode: "INVALID_REQUEST",
              actionRunId: getActionRunId(input.body),
            }),
          },
        };
      }
      try {
        const data = linkMeeglePullRequestResponseSchema.parse(await service.link(request.data));
        return { statusCode: 200, body: { ok: true as const, data } };
      } catch (error) {
        const typed = error instanceof MeeglePullRequestLinkError ? error : undefined;
        const statusCode = typed?.statusCode ?? 500;
        const errorEnvelope = createActionErrorEnvelopeFromError(error, {
          layer: typed?.layer,
          module: "meegle-pull-request-link",
          stage: typed?.stage ?? "server.workflow.failed",
          errorCode: typed?.code ?? "MEEGLE_PULL_REQUEST_LINK_FAILED",
          errorMessage: typed?.message ?? "无法关联 GitHub PR。",
          actionRunId: request.data.actionRunId,
        });
        controllerLogger.warn({ ...errorEnvelope, operation: "meegle_workitem.link_pull_request" }, "MEEGLE_PULL_REQUEST_LINK_FAILED");
        return { statusCode, body: { ok: false as const, error: errorEnvelope } };
      }
    },
  };
}
