import { createWebPlatformDataController } from "./platform-data.controller.js";

describe("web platform data controller", () => {
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
      githubPullRequests: [{
        owner: "TenwaysCom",
        repo: "Tenways",
        pullNumber: 1138,
        title: "Linked PR",
        htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
        headRef: "feature/m-1138",
        baseRef: "main",
        state: "merged",
        odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
      }],
      plannedSprint: "must not leak",
      syncedAt: "2026-08-09T00:00:00.000Z",
    }], sprints: ["Odoo Sprint 20260806"] }) };
    const ensureSession = vi.fn().mockResolvedValue({ ok: true, role: "dev", user: {} });
    const controller = createWebPlatformDataController({ service, ensureSession });

    const result = await controller({
      kind: "meegle-workitems",
      cookieHeader: "octo_web_session=session-token",
      query: { limit: "500", sprint: "Odoo Sprint 20260806" },
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
        githubPullRequests: [expect.objectContaining({ pullNumber: 1138, headRef: "feature/m-1138", baseRef: "main", state: "merged", odooShBuilds: [{ environment: "eu", status: "done", result: "success" }] })],
      })], sprints: ["Odoo Sprint 20260806"] } },
    });
    expect((result.body as { data: { items: Array<Record<string, unknown>> } }).data.items[0]).not.toHaveProperty("plannedSprint");
    expect(ensureSession).toHaveBeenCalledWith("session-token");
    expect(service.list).toHaveBeenCalledWith("meegle-workitems", 500, { sprint: "Odoo Sprint 20260806" });
  });

  it("passes validated Lark Ticket time ranges and issue types to the service", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [] }) };
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
      },
    })).resolves.toEqual({ statusCode: 200, body: { ok: true, data: { items: [] } } });
    expect(service.list).toHaveBeenCalledWith("lark-tickets", 500, {
      larkTickets: {
        createdAfter: "2026-08-01T00:00:00.000Z",
        createdBefore: "2026-08-31T23:59:59.000Z",
        sourceUpdatedAtAfter: "2026-08-09T16:00:00.000Z",
        sourceUpdatedAtBefore: "2026-08-20T00:00:00.000Z",
        issueTypes: ["Feature", "Bug"],
      },
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
      syncedAt: "2026-08-10T00:00:00.000Z",
      odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
    }] }) };
    const controller = createWebPlatformDataController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "devops", user: {} }),
    });

    await expect(controller({
      kind: "github-pull-requests",
      cookieHeader: "octo_web_session=session-token",
      query: {},
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { items: [expect.objectContaining({
        headRef: "feature/m-1138",
        authorLogin: "octo",
        mergedBy: "maintainer",
        reviewers: ["reviewer"],
        labels: ["bug"],
        odooShBuilds: [{ environment: "eu", status: "done", result: "success" }],
      })] } },
    });
    expect(service.list).toHaveBeenCalledWith("github-pull-requests", 500, { sprint: undefined });
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
