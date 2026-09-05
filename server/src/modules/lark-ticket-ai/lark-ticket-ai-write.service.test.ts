import { createLarkTicketAiWriteService } from "./lark-ticket-ai-write.service.js";

describe("Lark Ticket AI write service", () => {
  it("writes a supported AI update to the Octo-local Ticket record", async () => {
    const syncStore = {
      findLarkBaseTicketByRecordId: vi.fn().mockResolvedValue({ baseId: "base", tableId: "table", recordId: "rec_1" }),
      upsertLarkBaseTicketAi: vi.fn().mockResolvedValue(true),
    };
    const service = createLarkTicketAiWriteService({ syncStore });

    await expect(service.update({ recordId: "rec_1", fields: { "AI分析状态": "已分析" } })).resolves.toEqual({
      recordId: "rec_1",
      updated: true,
      storedInOcto: true,
    });
    expect(syncStore.upsertLarkBaseTicketAi).toHaveBeenCalledWith({
      baseId: "base", tableId: "table", recordId: "rec_1", fields: { "AI分析状态": "已分析" },
    });
  });

  it("does not create a local AI record without a synchronized Ticket snapshot", async () => {
    const service = createLarkTicketAiWriteService({
      syncStore: {
        findLarkBaseTicketByRecordId: vi.fn().mockResolvedValue(undefined),
        upsertLarkBaseTicketAi: vi.fn(),
      },
    });

    await expect(service.update({ recordId: "rec_1", fields: { "AI分析状态": "已分析" } }))
      .rejects.toMatchObject({ code: "LARK_TICKET_SNAPSHOT_NOT_FOUND" });
  });
});
