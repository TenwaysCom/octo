import { describe, expect, it, vi } from "vitest";
import { createWebPlatformSyncController } from "./web-platform-sync.controller.js";

const config = {
  meegle: [{
    projectKey: "project",
    workItemTypeKeys: ["story", "66700acbf297a8f821b4b860", "6932e40429d1cd8aac635c82"],
    sourceUpdatedAtMqlFieldNames: { story: "updated_at", "66700acbf297a8f821b4b860": "updated_at", "6932e40429d1cd8aac635c82": "updated_at" },
  }],
  github: [
    { owner: "TenwaysCom", repo: "Tenways" },
    { owner: "TenwaysCom", repo: "tenways-ukk" },
    { owner: "TWS-lance", repo: "odoo_tenways" },
  ],
  larkBase: [{ baseId: "base", tableId: "table", sourceUpdatedAtFieldName: "最后更新时间" }],
};

function createController(service = {
  incrementalSyncMeegleWorkitems: vi.fn().mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1, watermarkUpdatedAt: "2026-08-12T00:01:00.000Z", watermarkTiebreaker: "story:1" }),
  incrementalSyncLarkBaseTickets: vi.fn().mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1, watermarkUpdatedAt: "2026-08-12T00:01:00.000Z", watermarkTiebreaker: "rec-1" }),
  incrementalSyncGitHubPullRequests: vi.fn().mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1, watermarkUpdatedAt: "2026-08-12T00:01:00.000Z", watermarkTiebreaker: "000000000001" }),
}) {
  const checkpointStore = {
    get: vi.fn().mockImplementation(async (platform: string, scopeKey: string) => ({
      platform,
      scopeKey,
      watermarkUpdatedAt: "2026-08-12T00:00:00.000Z",
      watermarkTiebreaker: "initial",
    })),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markFailure: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service,
    checkpointStore,
    controller: createWebPlatformSyncController({
      service,
      checkpointStore,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "devops", user: {} } as never),
      loadConfig: async () => config,
    }),
  };
}

describe("web platform sync controller", () => {
  it("lists Meegle types and the three GitHub repositories as independent sync sources", async () => {
    const { controller } = createController();
    const result = await controller.list({ cookieHeader: "octo_web_session=session" });

    expect(result).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        data: {
          sources: expect.arrayContaining([
            { id: "lark-tickets", label: "Lark Ticket", configured: true },
            { id: "meegle-user-stories", label: "Meegle User Story", configured: true },
            { id: "meegle-tech-tasks", label: "Meegle Tech Task", configured: true },
            { id: "meegle-production-bugs", label: "Meegle Production Bug", configured: true },
            { id: "github-odoo-eu", label: "GitHub · Odoo EU", configured: true },
            { id: "github-odoo-uk", label: "GitHub · Odoo UK", configured: true },
            { id: "github-odoo-us", label: "GitHub · Odoo US", configured: true },
          ]),
        },
      },
    });
  });

  it("runs the requested Meegle type incrementally across its own checkpoint scope", async () => {
    const { controller, service, checkpointStore } = createController();
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "meegle-tech-tasks",
      body: { actionRunId: "run_1" },
    });

    expect(result.statusCode).toBe(200);
    expect(service.incrementalSyncMeegleWorkitems).toHaveBeenCalledWith({
      masterUserId: "user_1",
      projectKey: "project",
      workItemTypeKeys: ["66700acbf297a8f821b4b860"],
      sourceUpdatedAtMqlFieldNames: { "66700acbf297a8f821b4b860": "updated_at" },
      cleanAfterSync: true,
      actionRunId: "run_1",
      watermarkUpdatedAt: "2026-08-12T00:00:00.000Z",
      watermarkTiebreaker: "initial",
    });
    expect(checkpointStore.markSuccess).toHaveBeenCalledWith(expect.objectContaining({
      platform: "meegle",
      scopeKey: "project/66700acbf297a8f821b4b860",
      watermarkUpdatedAt: "2026-08-12T00:01:00.000Z",
    }));
  });

  it("runs only the selected GitHub repository", async () => {
    const { controller, service } = createController();
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "github-odoo-uk",
      body: { actionRunId: "run_2" },
    });

    expect(result.statusCode).toBe(200);
    expect(service.incrementalSyncGitHubPullRequests).toHaveBeenCalledWith({
      owner: "TenwaysCom",
      repo: "tenways-ukk",
      cleanAfterSync: true,
      actionRunId: "run_2",
      watermarkUpdatedAt: "2026-08-12T00:00:00.000Z",
      watermarkTiebreaker: "initial",
    });
  });

  it("always cleans Lark snapshots after a Web-triggered sync", async () => {
    const { controller, service } = createController();
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "lark-tickets",
      body: { actionRunId: "run_3" },
    });

    expect(result.statusCode).toBe(200);
    expect(service.incrementalSyncLarkBaseTickets).toHaveBeenCalledWith({
      masterUserId: "user_1",
      baseId: "base",
      tableId: "table",
      sourceUpdatedAtFieldName: "最后更新时间",
      cleanAfterSync: true,
      actionRunId: "run_3",
      watermarkUpdatedAt: "2026-08-12T00:00:00.000Z",
      watermarkTiebreaker: "initial",
    });
  });

  it("rejects synchronization for a source omitted from local configuration", async () => {
    const { service, checkpointStore } = createController();
    const controller = createWebPlatformSyncController({
      service,
      checkpointStore,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "devops", user: {} } as never),
      loadConfig: async () => ({ ...config, github: config.github.slice(0, 2) }),
    });
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "github-odoo-us",
      body: { actionRunId: "run_1" },
    });

    expect(result).toMatchObject({ statusCode: 502, body: { error: { errorCode: "SYNC_SOURCE_NOT_CONFIGURED" } } });
  });

  it("rejects synchronization for roles without devops access", async () => {
    const { service } = createController();
    const controller = createWebPlatformSyncController({
      service,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "dev", user: {} } as never),
      loadConfig: async () => config,
    });

    await expect(controller.list({ cookieHeader: "octo_web_session=session" })).resolves.toMatchObject({
      statusCode: 403,
      body: { error: { errorCode: "WORKSPACE_ACCESS_DENIED" } },
    });
    await expect(controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "lark-tickets",
      body: { actionRunId: "run_1" },
    })).resolves.toMatchObject({
      statusCode: 403,
      body: { error: { errorCode: "WORKSPACE_ACCESS_DENIED" } },
    });
    expect(service.incrementalSyncLarkBaseTickets).not.toHaveBeenCalled();
  });

  it("rejects a Web sync without a safe checkpoint instead of falling back to full sync", async () => {
    const { service, checkpointStore } = createController();
    checkpointStore.get.mockResolvedValue(undefined);
    const controller = createWebPlatformSyncController({
      service,
      checkpointStore,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "devops", user: {} } as never),
      loadConfig: async () => config,
    });

    await expect(controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "meegle-user-stories",
      body: { actionRunId: "run_4" },
    })).resolves.toMatchObject({
      statusCode: 409,
      body: { error: { errorCode: "SYNC_CHECKPOINT_REQUIRED" } },
    });
    expect(service.incrementalSyncMeegleWorkitems).not.toHaveBeenCalled();
  });

  it("records checkpoint failure when a Web incremental source fails", async () => {
    const { controller, service, checkpointStore } = createController();
    service.incrementalSyncGitHubPullRequests.mockRejectedValueOnce(new Error("GitHub unavailable"));

    await expect(controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "github-odoo-eu",
      body: { actionRunId: "run_5" },
    })).resolves.toMatchObject({ statusCode: 502, body: { error: { errorCode: "SYNC_FAILED" } } });
    expect(checkpointStore.markFailure).toHaveBeenCalledWith("github", "TenwaysCom/Tenways", expect.any(Error));
  });
});
