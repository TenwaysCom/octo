const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { connect() { return Promise.resolve({ query: mocks.query, release: mocks.release }); } end = mocks.end; } }));
import { exportTicketEvalRows } from "./ticket-eval-export.js";

describe("read-only Ticket eval export", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("uses a read-only snapshot, parameterizes scope and exports prepared rather than raw content", async () => {
    mocks.query.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      base_id: "base", table_id: "table", record_id: "rec", ticket_number: "1", title: "test",
      fields_json: "{}", history_complete: true, snapshot_version: 1,
      messages_json: JSON.stringify({ messages: [{ messageId: "root", senderId: "PRIVATE_ID", senderType: "user", messageType: "text",
        createdAt: "2026-09-24T00:00:00Z", content: JSON.stringify({ text: "contact person@example.com" }) }] }), shadow_ai: "{}",
    }] });
    const result = await exportTicketEvalRows({ connectionString: "unused", baseId: "base", tableId: "table", limit: 5 });
    expect(mocks.query.mock.calls[0][0]).toContain("READ ONLY");
    expect(mocks.query.mock.calls[1][1]).toEqual(["base", "table", 5]);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(JSON.stringify(result)).not.toContain("person@example.com");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ID");
    expect(result.tickets[0].messages[0].text).toContain("[EMAIL]");
    expect(mocks.release).toHaveBeenCalled(); expect(mocks.end).toHaveBeenCalled();
  });
  it("rolls back and closes on query failure without migrating or syncing", async () => {
    mocks.query.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("query failed"));
    await expect(exportTicketEvalRows({ connectionString: "unused", baseId: "b", tableId: "t", limit: 1 })).rejects.toThrow();
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalled(); expect(mocks.end).toHaveBeenCalled();
  });
});
