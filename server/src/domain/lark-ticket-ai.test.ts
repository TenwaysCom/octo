import {
  parseLarkTicketAiData,
  pickLarkTicketAiFields,
} from "./lark-ticket-ai.js";

describe("Lark Ticket AI field contract", () => {
  it("keeps only the explicit support-QA and eval fields", () => {
    expect(pickLarkTicketAiFields({
      "AI分析状态": "已分析",
      "AI Gate Eval Score": 100,
      "Issue Description": "source fact",
    })).toEqual({ "AI分析状态": "已分析", "AI Gate Eval Score": 100 });
  });

  it("parses local data without a Lark writeback state", () => {
    const data = parseLarkTicketAiData(JSON.stringify({
      fields: { "AI分析状态": "已分析" },
      updatedAt: "2026-08-14T00:00:00.000Z",
    }));
    expect(data).toMatchObject({ fields: { "AI分析状态": "已分析" } });
    expect(data).not.toHaveProperty("syncedAt");
  });
});
