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

  it("returns a validated, bounded snapshot query", async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [{ recordId: "rec-1" }] }) };
    const ensureSession = vi.fn().mockResolvedValue({ ok: true, user: {} });
    const controller = createWebPlatformDataController({ service, ensureSession });

    await expect(controller({
      kind: "lark-tickets",
      cookieHeader: "octo_web_session=session-token",
      query: { limit: "20" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { items: [{ recordId: "rec-1" }] } },
    });
    expect(ensureSession).toHaveBeenCalledWith("session-token");
    expect(service.list).toHaveBeenCalledWith("lark-tickets", 20);
  });
});
