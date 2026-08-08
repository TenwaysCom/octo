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
      system: "Odoo/Odoo UK",
      plannedSprint: "must not leak",
      syncedAt: "2026-08-09T00:00:00.000Z",
    }] }) };
    const ensureSession = vi.fn().mockResolvedValue({ ok: true, user: {} });
    const controller = createWebPlatformDataController({ service, ensureSession });

    const result = await controller({
      kind: "meegle-workitems",
      cookieHeader: "octo_web_session=session-token",
      query: { limit: "20" },
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
        system: "Odoo/Odoo UK",
      })] } },
    });
    expect((result.body as { data: { items: Array<Record<string, unknown>> } }).data.items[0]).not.toHaveProperty("plannedSprint");
    expect(ensureSession).toHaveBeenCalledWith("session-token");
    expect(service.list).toHaveBeenCalledWith("meegle-workitems", 20);
  });
});
