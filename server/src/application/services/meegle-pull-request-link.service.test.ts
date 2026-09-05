import type { GitHubPrDetails } from "../../adapters/github/github-types.js";
import type { GitHubPullRequestSyncItem, MeegleWorkitemSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import {
  hasMeegleMarker,
  MeeglePullRequestLinkService,
} from "./meegle-pull-request-link.service.js";

function workitem(system = "Odoo/Odoo UK"): MeegleWorkitemSyncItem {
  return {
    projectKey: "project",
    workItemTypeKey: "story",
    workItemId: "13802503",
    title: "Story",
    system,
    syncedAt: "2026-09-01T00:00:00.000Z",
  };
}

function snapshot(overrides: Partial<GitHubPullRequestSyncItem> = {}): GitHubPullRequestSyncItem {
  return {
    owner: "TenwaysCom",
    repo: "tenways-ukk",
    pullNumber: 42,
    title: "Fix checkout",
    state: "open",
    htmlUrl: "https://github.com/TenwaysCom/tenways-ukk/pull/42",
    authorLogin: "ada",
    headRef: "fix/checkout",
    baseRef: "main",
    isDraft: true,
    meegleIds: [],
    syncedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function remotePullRequest(title = "Fix checkout"): GitHubPrDetails {
  return {
    number: 42,
    title,
    body: "Description",
    state: "open",
    html_url: "https://github.com/TenwaysCom/tenways-ukk/pull/42",
    merged_at: null,
    updated_at: "2026-09-01T01:00:00.000Z",
    draft: true,
    user: { login: "ada" },
    head: { ref: "fix/checkout" },
    base: { ref: "main" },
  };
}

function createDeps(options: { title?: string; system?: string } = {}) {
  const syncedPullRequest = snapshot();
  const store = {
    listMeegleWorkitemsByIds: vi.fn().mockResolvedValue([workitem(options.system)]),
    listGitHubPullRequests: vi.fn().mockResolvedValue([syncedPullRequest]),
    findGitHubPullRequest: vi.fn().mockResolvedValue(syncedPullRequest),
    upsertGitHubPullRequest: vi.fn().mockResolvedValue(undefined),
  };
  const githubClient = {
    getPullRequest: vi.fn().mockResolvedValue(remotePullRequest(options.title)),
    updatePullRequestTitle: vi.fn().mockImplementation(async (_owner, _repo, _pullNumber, title) => remotePullRequest(title)),
  };
  return { store, githubClient, service: new MeeglePullRequestLinkService(store, githubClient) };
}

describe("MeeglePullRequestLinkService", () => {
  it("lists local open and draft PRs from the workitem System repository", async () => {
    const { service, store } = createDeps();

    await expect(service.listCandidates({
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "13802503",
    })).resolves.toEqual({
      repository: { owner: "TenwaysCom", repo: "tenways-ukk" },
      candidates: [expect.objectContaining({
        pullNumber: 42,
        authorLogin: "ada",
        headRef: "fix/checkout",
        baseRef: "main",
        isDraft: true,
        linked: false,
      })],
    });
    expect(store.listGitHubPullRequests).toHaveBeenCalledWith(500, {
      statuses: ["open", "draft"],
      repositories: ["TenwaysCom / tenways-ukk"],
    });
  });

  it("appends the exact Meegle marker and refreshes the local PR snapshot", async () => {
    const { service, store, githubClient } = createDeps();

    await expect(service.link({
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "13802503",
      owner: "TenwaysCom",
      repo: "tenways-ukk",
      pullNumber: 42,
      actionRunId: "action-1",
    })).resolves.toMatchObject({
      actionRunId: "action-1",
      marker: "m-13802503",
      titleUpdated: true,
      pullRequest: { title: "Fix checkout m-13802503", pullNumber: 42 },
    });
    expect(githubClient.updatePullRequestTitle).toHaveBeenCalledWith(
      "TenwaysCom",
      "tenways-ukk",
      42,
      "Fix checkout m-13802503",
      { actionRunId: "action-1" },
    );
    expect(store.upsertGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      owner: "TenwaysCom",
      repo: "tenways-ukk",
      pullRequest: expect.objectContaining({ title: "Fix checkout m-13802503" }),
    }));
  });

  it("does not duplicate an existing marker", async () => {
    const { service, githubClient } = createDeps({ title: "Fix checkout [m-13802503]" });

    await expect(service.link({
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "13802503",
      owner: "TenwaysCom",
      repo: "tenways-ukk",
      pullNumber: 42,
      actionRunId: "action-2",
    })).resolves.toMatchObject({ titleUpdated: false });
    expect(githubClient.updatePullRequestTitle).not.toHaveBeenCalled();
  });

  it("rejects a selection outside the workitem System repository", async () => {
    const { service, githubClient } = createDeps();

    await expect(service.link({
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "13802503",
      owner: "TenwaysCom",
      repo: "Tenways",
      pullNumber: 42,
      actionRunId: "action-3",
    })).rejects.toMatchObject({
      code: "GITHUB_PULL_REQUEST_SYSTEM_MISMATCH",
      statusCode: 409,
    });
    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
  });
});

describe("hasMeegleMarker", () => {
  it("matches only the requested numeric marker", () => {
    expect(hasMeegleMarker("Fix m-13802503", "13802503")).toBe(true);
    expect(hasMeegleMarker("Fix m-138025030", "13802503")).toBe(false);
    expect(hasMeegleMarker("Fix am-13802503", "13802503")).toBe(false);
    expect(hasMeegleMarker("Fix m-13802503-extra", "13802503")).toBe(true);
  });
});
