import { ZodError } from "zod";

import type { GitHubClient } from "../../adapters/github/github-client.js";
import { OdooDevopsBranchesClientError } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import type { OdooDevopsBranchesService } from "../../application/services/odoo-devops-branches.service.js";
import { resolveGitHubRepoEnvironment } from "../../application/services/odoo-devops-environment-mapping.js";
import { ensureLarkWebSession } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import {
  githubPrOdooDevopsBuildQuerySchema,
  githubPrOdooDevopsBuildResponseSchema,
} from "./github-pr-odoo-devops-build.dto.js";

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

export function createWebGitHubPrOdooDevopsBuildController(deps: {
  githubClient?: Pick<GitHubClient, "getPullRequest">;
  odooDevopsBranchesService: Pick<OdooDevopsBranchesService, "getOrStartRefresh">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
}) {
  const ensureSession = deps.ensureSession ?? ensureLarkWebSession;

  return async function getWebGitHubPrOdooDevopsBuild(input: { cookieHeader: string | undefined; query: unknown }) {
    const session = await ensureSession(readCookie(input.cookieHeader, WEB_SESSION_COOKIE_NAME));
    if (!session.ok) {
      return {
        statusCode: 401,
        body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
      };
    }

    try {
      const query = githubPrOdooDevopsBuildQuerySchema.parse(input.query);
      const environment = resolveGitHubRepoEnvironment(query.repo);
      if (!environment) {
        return {
          statusCode: 404,
          body: { ok: false as const, error: { errorCode: "ODOO_DEVOPS_REPO_UNMAPPED", errorMessage: "当前仓库未配置 Odoo.sh 环境。" } },
        };
      }
      if (!query.headRef && !deps.githubClient) {
        return {
          statusCode: 503,
          body: { ok: false as const, error: { errorCode: "GITHUB_NOT_CONFIGURED", errorMessage: "GitHub PR 查询暂时不可用。" } },
        };
      }

      const pullRequest = query.headRef ? undefined : await deps.githubClient!.getPullRequest(query.owner, query.repo, query.pullNumber);
      const headRef = query.headRef ?? pullRequest?.head?.ref;
      if (!headRef) {
        return {
          statusCode: 502,
          body: { ok: false as const, error: { errorCode: "GITHUB_PR_HEAD_MISSING", errorMessage: "无法读取 GitHub PR 的 head branch。" } },
        };
      }
      const result = await deps.odooDevopsBranchesService.getOrStartRefresh(environment);
      if (result.state === "refreshing") {
        return {
          statusCode: 202,
          body: { ok: true as const, data: githubPrOdooDevopsBuildResponseSchema.parse({
            state: "refreshing", environment, headRef, build: null, retryAfterMs: 1_000,
          }) },
        };
      }
      if (result.state === "unavailable") {
        return {
          statusCode: 503,
          body: { ok: false as const, error: { errorCode: "ODOO_DEVOPS_UNAVAILABLE", errorMessage: "Odoo DevOps 分支状态暂时不可用。" } },
        };
      }
      const matchedBuild = result.snapshot.items.find((item) => item.branch === headRef);
      const data = githubPrOdooDevopsBuildResponseSchema.parse({
        state: "ready",
        environment,
        headRef,
        build: matchedBuild ? {
          branch: matchedBuild.branch,
          status: matchedBuild.last_build_status,
          result: matchedBuild.last_build_result,
        } : null,
        stale: result.stale,
      });
      return { statusCode: 200, body: { ok: true as const, data } };
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
          body: { ok: false as const, error: { errorCode: error.code, errorMessage: "Odoo DevOps 分支状态暂时不可用。" } },
        };
      }
      return {
        statusCode: 502,
        body: { ok: false as const, error: { errorCode: "GITHUB_PR_READ_FAILED", errorMessage: "无法读取 GitHub PR 构建状态。" } },
      };
    }
  };
}
