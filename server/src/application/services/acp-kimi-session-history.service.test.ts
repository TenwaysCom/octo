import { createAcpKimiSessionHistoryService } from "./acp-kimi-session-history.service.js";
import type { AcpKimiSessionOwnershipRecord } from "../../adapters/postgres/acp-kimi-session-ownership-store.js";

const HERMES_SESSION = "hermes_11111111-1111-4111-8111-111111111111";

function fixture(sessionId = HERMES_SESSION) {
  const ownership = {
    sessionId, operatorLarkId: "operator", title: "Saved title", kimiWorkDir: "/workspace",
    automationActionKey: "lark-ticket-support-qa-answer", permissionProfileId: "support-qa.answer.v1",
    permissionProfileVersion: "1", actionRunId: "history_test", ticketNumber: "TEN-10",
    updatedAt: "2026-09-05T10:00:00Z", deletedAt: null,
  } as AcpKimiSessionOwnershipRecord;
  const ownershipStore = {
    getBySessionId: vi.fn().mockResolvedValue(ownership), listByOperatorLarkId: vi.fn().mockResolvedValue([ownership]),
    listByTicket: vi.fn(), claim: vi.fn(), rename: vi.fn(), attachTicket: vi.fn(), touch: vi.fn(), deleteForOperator: vi.fn(),
  };
  const sessionRegistry = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), touch: vi.fn() };
  const createSessionRuntime = vi.fn().mockResolvedValue({ sessionId, prompt: vi.fn(), close: vi.fn() });
  const exportSessionEvents = vi.fn().mockResolvedValue([]);
  const listSessions = vi.fn().mockResolvedValue([]);
  const service = createAcpKimiSessionHistoryService({ ownershipStore, sessionRegistry, createSessionRuntime, exportSessionEvents, listSessions });
  return { service, ownershipStore, sessionRegistry, createSessionRuntime, exportSessionEvents, listSessions };
}

describe("mixed ACP session history", () => {
  it("restores a Hermes session with its saved permission profile and never calls kimi export", async () => {
    const test = fixture();
    await test.service.loadSession({ operatorLarkId: "operator", sessionId: HERMES_SESSION });
    expect(test.createSessionRuntime).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: HERMES_SESSION, cwd: "/workspace",
      agentProvider: "hermes_acp", agentSessionId: HERMES_SESSION,
    }));
    expect(test.sessionRegistry.set).toHaveBeenCalledWith(expect.objectContaining({
      permissionContext: expect.objectContaining({ ticketNumber: "TEN-10", actionRunId: "history_test", permissionProfileId: "support-qa.answer.v1" }),
    }));
    expect(test.exportSessionEvents).not.toHaveBeenCalled();
  });

  it("retains Kimi export recovery for old sessions", async () => {
    const test = fixture("old-kimi-session");
    await test.service.loadSession({ operatorLarkId: "operator", sessionId: "old-kimi-session" });
    expect(test.exportSessionEvents).toHaveBeenCalledWith("old-kimi-session");
  });

  it("rejects another operator before starting either runtime", async () => {
    const test = fixture();
    await expect(test.service.loadSession({ operatorLarkId: "other", sessionId: HERMES_SESSION })).rejects.toMatchObject({ code: "SESSION_FORBIDDEN" });
    expect(test.createSessionRuntime).not.toHaveBeenCalled();
  });

  it("lists owned Hermes sessions when Kimi is unavailable", async () => {
    const test = fixture();
    test.listSessions.mockRejectedValue(new Error("Kimi unavailable"));
    await expect(test.service.listSessions({ operatorLarkId: "operator" })).resolves.toEqual([
      { sessionId: HERMES_SESSION, title: "Saved title", cwd: "/workspace", updatedAt: "2026-09-05T10:00:00Z" },
    ]);
    expect(test.ownershipStore.claim).not.toHaveBeenCalled();
  });
});
