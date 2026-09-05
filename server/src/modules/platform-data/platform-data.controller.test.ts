import {
  createWebGitHubPullRequestPreviewController,
  createWebMeeglePullRequestLinkController,
  createWebMeegleSprintHistoryController,
  createWebPlatformDataController,
} from "./platform-data.controller.js";
import { MeeglePullRequestLinkError } from "../../application/services/meegle-pull-request-link.service.js";
import { meegleWorkitemListResponseSchema } from "./platform-data.dto.js";

describe("web platform data controller", () => {
  it("accepts date-only lifecycle fields and mixed-format Meegle source timestamps", () => {
    expect(meegleWorkitemListResponseSchema.parse({
      items: [{
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "1",
        title: "Story",
        relatedPeople: [],
        githubPullRequests: [],
        itemStartTime: "2026-08-01",
        itemFinishTime: "2026-08-10",
        sourceUpdatedAt: "2026-08-10 12:34:56",
        syncedAt: "2026-08-10T12:35:00.000Z",
      }],
      sprints: [],
      relatedPersonOptions: [],
      pager: { offset: 0, limit: 500, total: 1, hasMore: false },
    }).items[0]).toMatchObject({
      itemStartTime: "2026-08-01",
      itemFinishTime: "2026-08-10",
      sourceUpdatedAt: "2026-08-10 12:34:56",
    });
  });

  it("requires the opaque web session before reading snapshots", async () => {
    const service = { list: vi.fn() };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({
        ok: false,
        errorCode: "UNAUTHENTICATED",
        errorMessage: "Missing web session.",
      }),
    });

    await expect(controller({ kind: "lark-tickets", cookieHeader: undefined, query: {} })).resolves.toEqual({
      statusCode: 401,
      body: { ok: false, error: { errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." } },
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("returns validated Meegle PR candidates and links one selected PR", async () => {
    const candidate = {
      owner: "TenwaysCom",
      repo: "tenways-ukk",
      pullNumber: 42,
      title: "Fix checkout m-13802503",
      htmlUrl: "https://github.com/TenwaysCom/tenways-ukk/pull/42",
      state: "open" as const,
      isDraft: true,
      authorLogin: "ada",
      headRef: "fix/checkout",
      baseRef: "main",
    };
    const service = {
      listCandidates: vi.fn().mockResolvedValue({
        repository: { owner: "TenwaysCom", repo: "tenways-ukk" },
        candidates: [{ ...candidate, linked: false }],
      }),
      link: vi.fn().mockResolvedValue({
        actionRunId: "action-1",
        marker: "m-13802503",
        titleUpdated: true,
        pullRequest: candidate,
      }),
    };
    const controller = createWebMeeglePullRequestLinkController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller.listCandidates({
      cookieHeader: "octo_web_session=session-token",
      query: { projectKey: "project", workItemTypeKey: "story", workItemId: "13802503" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: {
        repository: { owner: "TenwaysCom", repo: "tenways-ukk" },
        candidates: [{ ...candidate, linked: false }],
      } },
    });
    await expect(controller.link({
      cookieHeader: "octo_web_session=session-token",
      body: {
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "13802503",
        owner: "TenwaysCom",
        repo: "tenways-ukk",
        pullNumber: 42,
        actionRunId: "action-1",
      },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: {
        actionRunId: "action-1",
        marker: "m-13802503",
        titleUpdated: true,
        pullRequest: candidate,
      } },
    });
  });

  it("returns a structured action error when GitHub title update fails", async () => {
    const service = {
      listCandidates: vi.fn(),
      link: vi.fn().mockRejectedValue(new MeeglePullRequestLinkError(
        "GITHUB_PULL_REQUEST_TITLE_UPDATE_FAILED",
        "无法更新 GitHub PR 标题，请稍后重试。",
        502,
        "adapter",
        "adapter.github.pull_request.update",
      )),
    };
    const controller = createWebMeeglePullRequestLinkController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    const result = await controller.link({
      cookieHeader: "octo_web_session=session-token",
      body: {
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "13802503",
        owner: "TenwaysCom",
        repo: "tenways-ukk",
        pullNumber: 42,
        actionRunId: "action-failed",
      },
    });
    expect(result).toMatchObject({
      statusCode: 502,
      body: { ok: false, error: {
        actionRunId: "action-failed",
        layer: "adapter",
        module: "meegle-pull-request-link",
        stage: "adapter.github.pull_request.update",
        errorCode: "GITHUB_PULL_REQUEST_TITLE_UPDATE_FAILED",
      } },
    });
  });

  it("returns Sprint history from the dedicated web endpoint", async () => {
    const history = {
      sprintDetails: [{ projectKey: "project", sprintId: "sprint-1", name: "Sprint 1", syncedAt: "2026-08-09T00:00:00.000Z" }],
      sprintWorkitems: [{
        projectKey: "project", workItemTypeKey: "story", workItemId: "1", title: "Story",
        sprintId: "sprint-1", sprint: "Sprint 1", membershipSource: "incremental_observed",
        githubPullRequests: [], syncedAt: "2026-08-09T00:00:00.000Z",
      }],
    };
    const service = { listMeegleSprintHistory: vi.fn().mockResolvedValue(history) };
    const controller = createWebMeegleSprintHistoryController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({ cookieHeader: "octo_web_session=session-token" })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: {
        ...history,
        sprintWorkitems: history.sprintWorkitems.map((item) => ({ ...item, relatedPeople: [] })),
      } },
    });
    expect(service.listMeegleSprintHistory).toHaveBeenCalledOnce();
  });

  it("returns a validated, bounded Meegle snapshot including mapping fields", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [{
      projectKey: "4c3fv6",
      projectName: "Tenways Software R&D",
      workItemTypeKey: "story",
      workItemId: "13802503",
      title: "Story",
      workItemType: "Feature",
      statusKey: "sub_stage_1682410371762",
      status: "Launched",
      sprint: "Odoo Sprint 20260806",
      version: "Od EU v2.9.0",
      bugs: ["Bug 1"],
      priority: "P1",
      system: "Odoo/Odoo UK",
      currentNodeStartTime: "2026-08-09T02:00:00.000Z",
      githubPullRequests: [{
        owner: "TenwaysCom",
        repo: "Tenways",
        pullNumber: 1138,
        title: "Linked PR",
        htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
        headRef: "feature/m-1138",
        baseRef: "main",
        state: "merged",
        isDraft: false,
        odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
      }],
      plannedSprint: "must not leak",
      syncedAt: "2026-08-09T00:00:00.000Z",
    }], sprints: ["Odoo Sprint 20260806"], sprintDetails: [{
      projectKey: "4c3fv6",
      sprintId: "13100779",
      name: "Odoo Sprint 20260806",
      status: "Ended",
      description: "Sprint 说明",
      startAt: "2026-08-06T00:00:00.000Z",
      endAt: "2026-08-20T00:00:00.000Z",
      syncedAt: "2026-08-09T00:00:00.000Z",
    }], sprintWorkitems: [{
      projectKey: "4c3fv6",
      workItemTypeKey: "story",
      workItemId: "13802503",
      title: "Story",
      sprintId: "13100779",
      sprint: "Odoo Sprint 20260806",
      membershipSource: "incremental_observed",
      carryoverToSprintId: "next-sprint",
      carryoverToSprintName: "Odoo Sprint 20260820",
      githubPullRequests: [],
      syncedAt: "2026-08-09T00:00:00.000Z",
    }], total: 1 }) };
    const ensureSession = vi.fn().mockResolvedValue({ ok: true, role: "dev", meegleUserKey: "member-me", user: {} });
    const controller = createWebPlatformDataController({ service, ensureSession });

    const result = await controller({
      kind: "meegle-workitems",
      cookieHeader: "octo_web_session=session-token",
      query: {
        limit: "500", offset: "500", sprint: "Odoo Sprint 20260806", status: "Launched,New",
        project: "4c3fv6", priority: "P1", workitemType: "story", relatedPerson: ["member-1", "member-2"],
        subscribed: "true",
        sourceUpdatedAtAfter: "2026-08-01T00:00:00Z",
      },
    });
    expect(result).toEqual({
      statusCode: 200,
      body: { ok: true, data: { items: [expect.objectContaining({
        projectName: "Tenways Software R&D",
        workItemType: "Feature",
        statusKey: "sub_stage_1682410371762",
        status: "Launched",
        sprint: "Odoo Sprint 20260806",
        version: "Od EU v2.9.0",
        bugs: ["Bug 1"],
        priority: "P1",
        system: "Odoo/Odoo UK",
        currentNodeStartTime: "2026-08-09T02:00:00.000Z",
        githubPullRequests: [expect.objectContaining({ pullNumber: 1138, headRef: "feature/m-1138", baseRef: "main", state: "merged", odooShBuilds: [{ environment: "eu", status: "done", result: "success" }] })],
      })], sprints: ["Odoo Sprint 20260806"], relatedPersonOptions: [], pager: { offset: 500, limit: 500, total: 1, hasMore: false } } },
    });
    expect((result.body as { data: { items: Array<Record<string, unknown>> } }).data.items[0]).not.toHaveProperty("plannedSprint");
    expect(ensureSession).toHaveBeenCalledWith("session-token");
    expect(service.list).toHaveBeenCalledWith("meegle-workitems", 500, { meegleWorkitems: {
      sprints: ["Odoo Sprint 20260806"], statuses: ["Launched", "New"], projects: ["4c3fv6"], priorities: ["P1"],
      workitemTypes: ["story"], relatedPersonMemberKeys: ["member-1", "member-2"],
      subscribedMemberKey: "member-me",
      sourceUpdatedAtAfter: "2026-08-01T00:00:00.000Z", offset: 500,
    } });
  });

  it("requires a Meegle binding for the Subscribed quick filter", async () => {
    const service = { list: vi.fn() };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({
      kind: "meegle-workitems",
      cookieHeader: "octo_web_session=session-token",
      query: { subscribed: "true" },
    })).resolves.toEqual({
      statusCode: 409,
      body: { ok: false, error: { errorCode: "MEEGLE_BINDING_REQUIRED", errorMessage: "请先绑定 Meegle 账号。" } },
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("passes validated Lark Ticket time ranges and issue types to the service", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: {
        createdAfter: "2026-08-01",
        createdBefore: "2026-08-31T23:59:59Z",
        sourceUpdatedAtAfter: "2026-08-10T00:00:00+08:00",
        sourceUpdatedAtBefore: "2026-08-20T00:00:00Z",
        issueType: "Feature,Bug",
        status: ["Open", "In Progress"],
        priority: "P0",
        responsible: "Ada",
        quickFilter: "unsynced",
        offset: "500",
      },
    })).resolves.toEqual({ statusCode: 200, body: { ok: true, data: { items: [], pager: { offset: 500, limit: 500, total: 0, hasMore: false } } } });
    expect(service.list).toHaveBeenCalledWith("lark-tickets", 500, {
      larkTickets: {
        createdAfter: "2026-08-01T00:00:00.000Z",
        createdBefore: "2026-08-31T23:59:59.000Z",
        sourceUpdatedAtAfter: "2026-08-09T16:00:00.000Z",
        sourceUpdatedAtBefore: "2026-08-20T00:00:00.000Z",
        issueTypes: ["Feature", "Bug"],
        statuses: ["Open", "In Progress"],
        priorities: ["P0"],
        responsibles: ["Ada"],
        quickFilter: "unsynced",
        offset: 500,
      },
    });
  });

  it("returns a pager with the next offset when matching rows remain", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [{ recordId: "rec-1" }], total: 2 }) };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: { limit: "1", offset: "1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: {
        items: [{ recordId: "rec-1" }],
        pager: { offset: 1, limit: 1, total: 2, hasMore: false },
      } },
    });

    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: { limit: "1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: {
        items: [{ recordId: "rec-1" }],
        pager: { offset: 0, limit: 1, total: 2, hasMore: true, nextOffset: 1 },
      } },
    });
  });

  it("rejects Lark Ticket filters on another platform or an invalid time range", async () => {
    const service = { list: vi.fn() };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({
      kind: "meegle-workitems",
      cookieHeader: "octo_web_session=session-token",
      query: { issueType: "Feature" },
    })).resolves.toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST" } } });
    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: { relatedPerson: "member-1" },
    })).resolves.toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST" } } });
    await expect(controller({
      kind: "github-pull-requests",
      cookieHeader: "octo_web_session=session-token",
      query: { subscribed: "true" },
    })).resolves.toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST" } } });
    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: { createdAfter: "2026-08-02T00:00:00Z", createdBefore: "2026-08-01T00:00:00Z" },
    })).resolves.toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST" } } });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("returns validated Odoo.sh build data for GitHub PR rows", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [{
      owner: "TenwaysCom",
      repo: "Tenways",
      pullNumber: 1138,
      title: "PR",
      description: "PR description",
      state: "open",
      htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
      authorLogin: "octo",
      mergedBy: "maintainer",
      reviewers: ["reviewer"],
      labels: ["bug"],
      headRef: "feature/m-1138",
      baseRef: "main",
      isDraft: false,
      meegleIds: ["13802503"],
      meegleWorkitems: [{
        projectKey: "project",
        projectName: "Tenways",
        workItemTypeKey: "story",
        workItemId: "13802503",
        workItemKey: "M-13802503",
        title: "Linked story",
        workItemType: "Feature",
        status: "Doing",
        sprint: "Sprint 1",
        version: "Version 1",
      }],
      syncedAt: "2026-08-10T00:00:00.000Z",
      odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
    }], total: 1 }) };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "devops", user: {} }),
    });

    await expect(controller({
      kind: "github-pull-requests",
      cookieHeader: "octo_web_session=session-token",
      query: {
        status: ["Draft", "open"],
        repo: "TenwaysCom / Tenways",
        label: "bug",
        reviewer: "reviewer",
        sourceUpdatedAtAfter: "2026-08-01T00:00:00Z",
        offset: "500",
      },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { items: [expect.objectContaining({
        headRef: "feature/m-1138",
        authorLogin: "octo",
        mergedBy: "maintainer",
        reviewers: ["reviewer"],
        labels: ["bug"],
        meegleIds: ["13802503"],
        odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
      })], pager: { offset: 500, limit: 500, total: 1, hasMore: false } } },
    });
    expect(service.list).toHaveBeenCalledWith("github-pull-requests", 500, { githubPullRequests: {
      statuses: ["Draft", "open"],
      repositories: ["TenwaysCom / Tenways"],
      labels: ["bug"],
      reviewers: ["reviewer"],
      sourceUpdatedAtAfter: "2026-08-01T00:00:00.000Z",
      offset: 500,
    } });
  });

  it("returns linked Meegle details from the on-demand GitHub PR preview", async () => {
    const preview = {
      owner: "TenwaysCom", repo: "Tenways", pullNumber: 1138, title: "PR", description: "PR description",
      state: "open", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138", isDraft: false,
      meegleIds: ["13802503"], syncedAt: "2026-08-10T00:00:00.000Z",
      meegleWorkitems: [{
        projectKey: "project", workItemTypeKey: "story", workItemId: "13802503", title: "Linked story",
        status: "Doing", sprint: "Sprint 1", version: "Version 1",
      }],
      odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
    };
    const service = { getGitHubPullRequestPreview: vi.fn().mockResolvedValue(preview) };
    const controller = createWebGitHubPullRequestPreviewController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=session-token",
      query: { owner: "TenwaysCom", repo: "Tenways", pullNumber: "1138" },
    })).resolves.toEqual({ statusCode: 200, body: { ok: true, data: preview } });
    expect(service.getGitHubPullRequestPreview).toHaveBeenCalledWith({ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1138 });
  });

  it("validates GitHub PR preview identity and returns 404 for a missing snapshot", async () => {
    const service = { getGitHubPullRequestPreview: vi.fn().mockResolvedValue(undefined) };
    const controller = createWebGitHubPullRequestPreviewController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({ cookieHeader: "octo_web_session=session-token", query: { owner: "bad/owner", repo: "repo", pullNumber: "1" } }))
      .resolves.toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST" } } });
    await expect(controller({ cookieHeader: "octo_web_session=session-token", query: { owner: "acme", repo: "repo", pullNumber: "404" } }))
      .resolves.toMatchObject({ statusCode: 404, body: { error: { errorCode: "GITHUB_PULL_REQUEST_NOT_FOUND" } } });
  });

  it("rejects list limits above 500", async () => {
    const service = { list: vi.fn() };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} }),
    });

    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: { limit: "501" },
    })).resolves.toMatchObject({
      statusCode: 400,
      body: { ok: false, error: { errorCode: "INVALID_REQUEST" } },
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("rejects platform snapshot reads for roles without developer access", async () => {
    const service = { list: vi.fn() };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "viewer", user: {} }),
    });

    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: {},
    })).resolves.toEqual({
      statusCode: 403,
      body: { ok: false, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权查看平台列表。" } },
    });
    expect(service.list).not.toHaveBeenCalled();
  });
});
