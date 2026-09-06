import { createAcpPermissionController } from "./acp-permission.controller.js";

const body = { sessionId: "public", actionRunId: "run", requestId: "11111111-1111-4111-8111-111111111111", optionId: "once" };
function fixture() {
  const service = { reply: vi.fn().mockReturnValue({ requestId: body.requestId, optionId: "once" }) };
  const resolveSession = vi.fn().mockResolvedValue({ ok: true, masterUserId: "user_1" });
  const ownershipStore = { getBySessionId: vi.fn().mockResolvedValue({ operatorLarkId: "ou_1", deletedAt: null }) };
  const controller = createAcpPermissionController({ service, resolveSession, resolveOperatorLarkId: vi.fn().mockResolvedValue("ou_1"), ownershipStore: ownershipStore as never });
  return { service, resolveSession, ownershipStore, controller };
}

describe("Web ACP permission replies", () => {
  it("uses the authenticated operator and rejects command or identity injection", async () => {
    const test = fixture();
    expect((await test.controller.reply({ body })).statusCode).toBe(200);
    expect(test.service.reply).toHaveBeenCalledWith({ ...body, operatorLarkId: "ou_1" });
    test.service.reply.mockClear();
    for (const extra of [{ operatorLarkId: "ou_other" }, { command: "replacement" }, { agentSessionId: "native" }]) {
      expect((await test.controller.reply({ body: { ...body, ...extra } })).statusCode).toBe(400);
    }
    expect(test.service.reply).not.toHaveBeenCalled();
  });
  it("rejects missing login, another owner and deleted sessions", async () => {
    const test = fixture();
    test.resolveSession.mockResolvedValueOnce({ ok: false, errorCode: "AUTH_REQUIRED", errorMessage: "Login required" });
    expect((await test.controller.reply({ body })).statusCode).toBe(401);
    test.ownershipStore.getBySessionId.mockResolvedValueOnce({ operatorLarkId: "other", deletedAt: null });
    expect((await test.controller.reply({ body })).statusCode).toBe(403);
    test.ownershipStore.getBySessionId.mockResolvedValueOnce({ operatorLarkId: "ou_1", deletedAt: "deleted" } as never);
    expect((await test.controller.reply({ body })).statusCode).toBe(403);
    expect(test.service.reply).not.toHaveBeenCalled();
  });
});
