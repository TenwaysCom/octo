import { describe, expect, it, vi } from "vitest";
import { createWebPlatformSyncController } from "./web-platform-sync.controller.js";

const config = {
  meegle: [{ projectKey: "project", workItemTypeKeys: ["story", "66700acbf297a8f821b4b860", "6932e40429d1cd8aac635c82"] }],
  github: [
    { owner: "TenwaysCom", repo: "Tenways" },
    { owner: "TenwaysCom", repo: "tenways-ukk" },
    { owner: "TWS-lance", repo: "odoo_tenways" },
  ],
  larkBase: [{ baseId: "base", tableId: "table" }],
};

function createController(service = {
  bulkSyncMeegleWorkitems: vi.fn().mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1 }),
  bulkSyncLarkBaseTickets: vi.fn().mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1 }),
  bulkSyncGitHubPullRequests: vi.fn().mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1 }),
}) {
  return {
    service,
    controller: createWebPlatformSyncController({
      service,
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

  it("runs only the requested Meegle type with the server-owned session identity", async () => {
    const { controller, service } = createController();
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "meegle-tech-tasks",
      body: { actionRunId: "run_1" },
    });

    expect(result.statusCode).toBe(200);
    expect(service.bulkSyncMeegleWorkitems).toHaveBeenCalledWith({
      masterUserId: "user_1",
      projectKey: "project",
      workItemTypeKeys: ["66700acbf297a8f821b4b860"],
      actionRunId: "run_1",
    });
  });

  it("runs only the selected GitHub repository", async () => {
    const { controller, service } = createController();
    const result = await controller.sync({
      cookieHeader: "octo_web_session=session",
      sourceId: "github-odoo-uk",
      body: { actionRunId: "run_2" },
    });

    expect(result.statusCode).toBe(200);
    expect(service.bulkSyncGitHubPullRequests).toHaveBeenCalledWith({
      repositories: [{ owner: "TenwaysCom", repo: "tenways-ukk" }],
      actionRunId: "run_2",
    });
  });

  it("rejects synchronization for a source omitted from local configuration", async () => {
    const { service } = createController();
    const controller = createWebPlatformSyncController({
      service,
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
    expect(service.bulkSyncLarkBaseTickets).not.toHaveBeenCalled();
  });
});
