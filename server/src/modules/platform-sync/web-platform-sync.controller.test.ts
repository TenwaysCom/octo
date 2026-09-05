import { describe, expect, it, vi } from "vitest";
import { PlatformSyncCoordinatorError } from "../../application/services/platform-sync-coordinator.js";
import { MEEGLE_SPRINT_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";
import { createWebPlatformSyncController } from "./web-platform-sync.controller.js";

const config = {
  meegle: [{
    projectKey: "project",
    workItemTypeKeys: ["story", "66700acbf297a8f821b4b860", "6932e40429d1cd8aac635c82", MEEGLE_SPRINT_WORKITEM_TYPE_KEY],
    sourceUpdatedAtMqlFieldNames: {
      story: "updated_at",
      "66700acbf297a8f821b4b860": "updated_at",
      "6932e40429d1cd8aac635c82": "updated_at",
      [MEEGLE_SPRINT_WORKITEM_TYPE_KEY]: "updated_at",
    },
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
  const coordinator = {
    runIncremental: vi.fn().mockImplementation(async (input) => ({
      ...await input.execute({
        watermarkUpdatedAt: "2026-08-12T00:00:00.000Z",
        watermarkTiebreaker: "initial",
      }, { actionRunId: input.actionRunId, runId: "db_run" }),
      runId: "db_run",
      actionRunId: input.actionRunId,
    })),
  };
  const statusStore = { list: vi.fn().mockResolvedValue([]) };
  const shadowStore = {
    getLarkTicketShadowSummaryWatermark: vi.fn().mockResolvedValue({
      ok: 2,
      skipped: 1,
      error: 1,
      pending: 3,
      lastAnalyzedAt: "2026-09-03T01:00:00.000Z",
    }),
  };
  return {
    service,
    coordinator,
    statusStore,
    shadowStore,
    controller: createWebPlatformSyncController({
      service,
      coordinator,
      statusStore,
      shadowStore,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "devops", user: {} } as never),
      loadConfig: async () => config,
    }),
  };
}

describe("web platform sync controller", () => {
  it("lists Meegle types and the three GitHub repositories as independent sync sources", async () => {
    const { controller, statusStore } = createController();
    statusStore.list.mockResolvedValueOnce([
      {
        platform: "meegle",
        scopeKey: `project/${MEEGLE_SPRINT_WORKITEM_TYPE_KEY}`,
        scheduled: true,
        nextRunAt: "2026-08-26T00:10:00.000Z",
        runStatus: "succeeded",
        runTrigger: "scheduled",
        lastRunAt: "2026-08-26T00:00:00.000Z",
        lastCompletedAt: "2026-08-26T00:01:00.000Z",
        lastSyncedAt: "2026-08-26T00:00:30.000Z",
      },
      {
        platform: "github",
        scopeKey: "TenwaysCom/Tenways",
        scheduled: true,
        nextRunAt: "2026-08-26T00:10:00.000Z",
        runStatus: "failed",
        runTrigger: "scheduled",
        lastRunAt: "2026-08-26T00:00:00.000Z",
        lastCompletedAt: "2026-08-26T00:01:00.000Z",
        lastSyncedAt: "2026-08-25T00:01:00.000Z",
        lastErrorCode: "PLATFORM_RATE_LIMITED",
      },
    ]);
    const result = await controller.list({ cookieHeader: "octo_web_session=session" });

    expect(result).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        data: {
          sources: expect.arrayContaining([
            expect.objectContaining({ id: "lark-tickets", label: "Lark Ticket", configured: true }),
            expect.objectContaining({ id: "meegle-user-stories", label: "Meegle User Story", configured: true }),
            expect.objectContaining({ id: "meegle-tech-tasks", label: "Meegle Tech Task", configured: true }),
            expect.objectContaining({ id: "meegle-production-bugs", label: "Meegle Production Bug", configured: true }),
            expect.objectContaining({
              id: "meegle-sprints",
              label: "Meegle Sprint",
              configured: true,
              scheduled: true,
              runStatus: "succeeded",
              lastSyncedAt: "2026-08-26T00:00:30.000Z",
            }),
            expect.objectContaining({
              id: "github-odoo-eu",
              label: "GitHub · Odoo EU",
              configured: true,
              scheduled: true,
              runStatus: "failed",
              lastSyncedAt: "2026-08-25T00:01:00.000Z",
              lastErrorCode: "PLATFORM_RATE_LIMITED",
            }),
            expect.objectContaining({ id: "github-odoo-uk", label: "GitHub · Odoo UK", configured: true }),
            expect.objectContaining({ id: "github-odoo-us", label: "GitHub · Odoo US", configured: true }),
          ]),
          shadowSummary: {
            ok: 2,
            skipped: 1,
            error: 1,
            pending: 3,
            lastAnalyzedAt: "2026-09-03T01:00:00.000Z",
            enabled: false,
          },
        },
      },
    });
    expect(statusStore.list).toHaveBeenCalledWith(expect.arrayContaining([
      { platform: "meegle", scopeKey: `project/${MEEGLE_SPRINT_WORKITEM_TYPE_KEY}` },
    ]));
  });

  it("includes the Lark ticket shadow analysis watermark in the source list", async () => {
    const { controller, shadowStore } = createController();
    const result = await controller.list({ cookieHeader: "octo_web_session=session" });

    expect(result).toMatchObject({
      statusCode: 200,
      body: {
        data: {
          shadowSummary: {
            ok: 2,
            skipped: 1,
            error: 1,
            pending: 3,
            lastAnalyzedAt: "2026-09-03T01:00:00.000Z",
            enabled: false,
          },
        },
      },
    });
    expect(shadowStore.getLarkTicketShadowSummaryWatermark).toHaveBeenCalledWith({ olderThan: expect.any(String) });
  });

  it("omits the shadow watermark instead of failing the list when the store read fails", async () => {
    const { controller, shadowStore } = createController();
    shadowStore.getLarkTicketShadowSummaryWatermark.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await controller.list({ cookieHeader: "octo_web_session=session" });

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);
    const data = result.body.ok ? result.body.data as { shadowSummary?: unknown } : {};
    expect(data.shadowSummary).toBeUndefined();
  });

  it("reports the shadow task as enabled when the scheduler config enables it", async () => {
    const { service, coordinator, statusStore, shadowStore } = createController();
    const controller = createWebPlatformSyncController({
      service,
      coordinator,
      statusStore,
      shadowStore,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "devops", user: {} } as never),
      loadConfig: async () => ({
        ...config,
        scheduler: { enabled: true, tasks: { shadow: { enabled: true } } },
      }),
    });
    const result = await controller.list({ cookieHeader: "octo_web_session=session" });

    expect(result).toMatchObject({
      statusCode: 200,
      body: { data: { shadowSummary: { enabled: true } } },
    });
  });

  it("runs the requested Meegle type incrementally across its own checkpoint scope", async () => {
    const { controller, service, coordinator } = createController();
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
    expect(coordinator.runIncremental).toHaveBeenCalledWith(expect.objectContaining({
      platform: "meegle",
      scopeKey: "project/66700acbf297a8f821b4b860",
      trigger: "manual",
      actionRunId: "run_1",
    }));
  });

  it("runs the Meegle Sprint source incrementally across the Sprint checkpoint scope", async () => {
    const { controller, service, coordinator } = createController();
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "meegle-sprints",
      body: { actionRunId: "run_sprint" },
    });

    expect(result.statusCode).toBe(200);
    expect(service.incrementalSyncMeegleWorkitems).toHaveBeenCalledWith({
      masterUserId: "user_1",
      projectKey: "project",
      workItemTypeKeys: [MEEGLE_SPRINT_WORKITEM_TYPE_KEY],
      sourceUpdatedAtMqlFieldNames: { [MEEGLE_SPRINT_WORKITEM_TYPE_KEY]: "updated_at" },
      cleanAfterSync: true,
      actionRunId: "run_sprint",
      watermarkUpdatedAt: "2026-08-12T00:00:00.000Z",
      watermarkTiebreaker: "initial",
    });
    expect(coordinator.runIncremental).toHaveBeenCalledWith(expect.objectContaining({
      platform: "meegle",
      scopeKey: `project/${MEEGLE_SPRINT_WORKITEM_TYPE_KEY}`,
      trigger: "manual",
      actionRunId: "run_sprint",
    }));
  });

  it("keeps the Meegle Sprint source visible but unavailable when its type is not configured", async () => {
    const { service, coordinator, statusStore, shadowStore } = createController();
    const controller = createWebPlatformSyncController({
      service,
      coordinator,
      statusStore,
      shadowStore,
      ensureSession: async () => ({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "devops", user: {} } as never),
      loadConfig: async () => ({
        ...config,
        meegle: config.meegle.map((target) => ({
          ...target,
          workItemTypeKeys: target.workItemTypeKeys.filter((key) => key !== MEEGLE_SPRINT_WORKITEM_TYPE_KEY),
        })),
      }),
    });

    await expect(controller.list({ cookieHeader: "octo_web_session=session" })).resolves.toMatchObject({
      statusCode: 200,
      body: {
        data: {
          sources: expect.arrayContaining([
            expect.objectContaining({ id: "meegle-sprints", configured: false }),
          ]),
        },
      },
    });
    await expect(controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "meegle-sprints",
      body: { actionRunId: "run_unconfigured_sprint" },
    })).resolves.toMatchObject({
      statusCode: 502,
      body: { error: { errorCode: "SYNC_SOURCE_NOT_CONFIGURED" } },
    });
    expect(service.incrementalSyncMeegleWorkitems).not.toHaveBeenCalled();
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
    const { service, coordinator } = createController();
    const controller = createWebPlatformSyncController({
      service,
      coordinator,
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
    const { service, coordinator } = createController();
    coordinator.runIncremental.mockRejectedValueOnce(new PlatformSyncCoordinatorError(
      "SYNC_CHECKPOINT_REQUIRED",
      "checkpoint required",
    ));
    const controller = createWebPlatformSyncController({
      service,
      coordinator,
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

  it("rejects a duplicate Web sync while the scope is already running", async () => {
    const { controller, coordinator } = createController();
    coordinator.runIncremental.mockRejectedValueOnce(new PlatformSyncCoordinatorError(
      "SYNC_ALREADY_RUNNING",
      "already running",
    ));

    await expect(controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "github-odoo-eu",
      body: { actionRunId: "run_duplicate" },
    })).resolves.toMatchObject({
      statusCode: 409,
      body: {
        error: {
          errorCode: "SYNC_ALREADY_RUNNING",
          stage: "server.sync.lease_acquire",
          actionRunId: "run_duplicate",
        },
      },
    });
  });

  it("maps a coordinated incremental source failure", async () => {
    const { controller, service, coordinator } = createController();
    service.incrementalSyncGitHubPullRequests.mockRejectedValueOnce(new Error("GitHub unavailable"));

    await expect(controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "github-odoo-eu",
      body: { actionRunId: "run_5" },
    })).resolves.toMatchObject({ statusCode: 502, body: { error: { errorCode: "SYNC_FAILED" } } });
    expect(coordinator.runIncremental).toHaveBeenCalledWith(expect.objectContaining({
      platform: "github",
      scopeKey: "TenwaysCom/Tenways",
    }));
  });
});
