import type { GitHubClient } from "../../adapters/github/github-client.js";
import {
  PostgresPlatformSyncStore,
  type GitHubPullRequestSyncItem,
  type MeegleWorkitemSyncItem,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import { logger } from "../../logger.js";
import { resolveMeegleSystemGitHubRepository } from "./odoo-devops-environment-mapping.js";

const serviceLogger = logger.child({ module: "meegle-pull-request-link" });
const MAX_CANDIDATES = 500;

export interface MeegleWorkitemRef {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
}

export interface LinkMeeglePullRequestInput extends MeegleWorkitemRef {
  owner: string;
  repo: string;
  pullNumber: number;
  actionRunId: string;
}

export class MeeglePullRequestLinkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly layer: "server" | "adapter" | "platform",
    public readonly stage: string,
  ) {
    super(message);
    this.name = "MeeglePullRequestLinkError";
  }
}

type Store = Pick<PlatformSyncStore,
  "listMeegleWorkitemsByIds" | "listGitHubPullRequests" | "findGitHubPullRequest" | "upsertGitHubPullRequest"
>;

type GitHubPullRequestClient = Pick<GitHubClient, "getPullRequest" | "updatePullRequestTitle">;

export class MeeglePullRequestLinkService {
  private store?: Store;

  constructor(
    store?: Store,
    private readonly githubClient?: GitHubPullRequestClient,
  ) {
    this.store = store;
  }

  async listCandidates(ref: MeegleWorkitemRef) {
    const workitem = await this.getWorkitem(ref);
    const repository = this.getRepository(workitem);
    const pullRequests = await this.syncStore.listGitHubPullRequests(MAX_CANDIDATES, {
      statuses: ["open", "draft"],
      repositories: [`${repository.owner} / ${repository.repo}`],
    });

    return {
      repository,
      candidates: pullRequests
        .filter((pullRequest) => pullRequest.state === "open")
        .map((pullRequest) => ({
          ...toCandidate(pullRequest),
          linked: pullRequest.meegleIds.includes(ref.workItemId),
        })),
    };
  }

  async link(input: LinkMeeglePullRequestInput) {
    serviceLogger.info({
      actionRunId: input.actionRunId,
      operation: "meegle_workitem.link_pull_request",
      layer: "server",
      stage: "server.workflow.started",
      projectKey: input.projectKey,
      workItemTypeKey: input.workItemTypeKey,
      workItemId: input.workItemId,
      owner: input.owner,
      repo: input.repo,
      pullNumber: input.pullNumber,
    }, "MEEGLE_PULL_REQUEST_LINK_STARTED");

    const workitem = await this.getWorkitem(input);
    const repository = this.getRepository(workitem);
    if (repository.owner !== input.owner || repository.repo !== input.repo) {
      throw new MeeglePullRequestLinkError(
        "GITHUB_PULL_REQUEST_SYSTEM_MISMATCH",
        "所选 PR 不属于当前工作项 System 对应的仓库。",
        409,
        "server",
        "server.workflow.validated",
      );
    }

    const snapshot = await this.syncStore.findGitHubPullRequest(input);
    if (!snapshot || snapshot.state !== "open") {
      throw new MeeglePullRequestLinkError(
        "GITHUB_PULL_REQUEST_NOT_SELECTABLE",
        "所选 PR 已关闭或不在本地候选快照中。",
        409,
        "server",
        "server.workflow.validated",
      );
    }
    if (!this.githubClient) {
      throw new MeeglePullRequestLinkError(
        "GITHUB_NOT_CONFIGURED",
        "Server 尚未配置 GitHub 写入凭据。",
        503,
        "server",
        "server.auth.checked",
      );
    }

    let pullRequest;
    try {
      pullRequest = await this.githubClient.getPullRequest(input.owner, input.repo, input.pullNumber);
    } catch {
      throw new MeeglePullRequestLinkError(
        "GITHUB_PULL_REQUEST_READ_FAILED",
        "无法读取 GitHub PR，请稍后重试。",
        502,
        "adapter",
        "adapter.github.pull_request.read",
      );
    }
    if (pullRequest.state !== "open" || pullRequest.merged_at) {
      throw new MeeglePullRequestLinkError(
        "GITHUB_PULL_REQUEST_NOT_SELECTABLE",
        "所选 PR 已不是 open/draft 状态。",
        409,
        "platform",
        "platform.github.pull_request.validated",
      );
    }

    const marker = `m-${input.workItemId}`;
    const titleUpdated = !hasMeegleMarker(pullRequest.title, input.workItemId);
    if (titleUpdated) {
      const nextTitle = `${pullRequest.title.trim()} ${marker}`.trim();
      try {
        pullRequest = await this.githubClient.updatePullRequestTitle(
          input.owner,
          input.repo,
          input.pullNumber,
          nextTitle,
          { actionRunId: input.actionRunId },
        );
      } catch {
        throw new MeeglePullRequestLinkError(
          "GITHUB_PULL_REQUEST_TITLE_UPDATE_FAILED",
          "无法更新 GitHub PR 标题，请稍后重试。",
          502,
          "adapter",
          "adapter.github.pull_request.update",
        );
      }
    }

    try {
      await this.syncStore.upsertGitHubPullRequest({
        owner: input.owner,
        repo: input.repo,
        pullRequest,
      });
    } catch {
      throw new MeeglePullRequestLinkError(
        "GITHUB_PULL_REQUEST_SNAPSHOT_UPDATE_FAILED",
        "GitHub PR 已更新，但本地快照刷新失败，请重试关联。",
        500,
        "server",
        "server.snapshot.updated",
      );
    }
    const linkedPullRequest = toCandidate({
      ...snapshot,
      title: pullRequest.title,
      description: pullRequest.body ?? undefined,
      state: pullRequest.state,
      htmlUrl: pullRequest.html_url,
      authorLogin: pullRequest.user?.login,
      headRef: pullRequest.head?.ref,
      baseRef: pullRequest.base?.ref,
      isDraft: pullRequest.draft ?? false,
      meegleIds: [...new Set([...snapshot.meegleIds, input.workItemId])],
    });

    serviceLogger.info({
      actionRunId: input.actionRunId,
      operation: "meegle_workitem.link_pull_request",
      layer: "server",
      stage: "server.workflow.completed",
      workItemId: input.workItemId,
      owner: input.owner,
      repo: input.repo,
      pullNumber: input.pullNumber,
      titleUpdated,
    }, "MEEGLE_PULL_REQUEST_LINK_COMPLETED");

    return { actionRunId: input.actionRunId, marker, titleUpdated, pullRequest: linkedPullRequest };
  }

  private async getWorkitem(ref: MeegleWorkitemRef) {
    const workitems = await this.syncStore.listMeegleWorkitemsByIds([ref.workItemId]);
    const workitem = workitems.find((candidate) => candidate.projectKey === ref.projectKey
      && candidate.workItemTypeKey === ref.workItemTypeKey
      && candidate.workItemId === ref.workItemId);
    if (!workitem) {
      throw new MeeglePullRequestLinkError(
        "MEEGLE_WORKITEM_NOT_FOUND",
        "未找到 Meegle 工作项同步快照。",
        404,
        "server",
        "server.snapshot.read",
      );
    }
    return workitem;
  }

  private getRepository(workitem: MeegleWorkitemSyncItem) {
    const repository = resolveMeegleSystemGitHubRepository(workitem.system);
    if (!repository) {
      throw new MeeglePullRequestLinkError(
        "MEEGLE_SYSTEM_GITHUB_REPOSITORY_NOT_FOUND",
        "当前工作项未设置受支持的 Odoo System，无法选择 GitHub PR。",
        422,
        "server",
        "server.mapping.resolved",
      );
    }
    return repository;
  }

  private get syncStore(): Store {
    this.store ??= new PostgresPlatformSyncStore();
    return this.store;
  }
}

export function hasMeegleMarker(title: string, workItemId: string): boolean {
  return new RegExp(`\\bm-${workItemId}\\b`, "i").test(title);
}

function toCandidate(pullRequest: GitHubPullRequestSyncItem) {
  return {
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pullNumber: pullRequest.pullNumber,
    title: pullRequest.title,
    htmlUrl: pullRequest.htmlUrl,
    state: pullRequest.state,
    isDraft: pullRequest.isDraft,
    ...(pullRequest.authorLogin ? { authorLogin: pullRequest.authorLogin } : {}),
    ...(pullRequest.headRef ? { headRef: pullRequest.headRef } : {}),
    ...(pullRequest.baseRef ? { baseRef: pullRequest.baseRef } : {}),
  };
}
