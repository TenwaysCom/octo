import { findTicketAiBackfillCandidates, parseArgs } from "./backfill-lark-ticket-ai.js";

describe("backfill Lark ticket AI", () => {
  it("copies historic AI fields into the Octo-owned projection only", () => {
    const candidates = findTicketAiBackfillCandidates([
      {
        base_id: "base", table_id: "table", record_id: "rec-1",
        fields_json: JSON.stringify({ "AI分析状态": "已分析", "Issue Description": "source" }),
        ticket_ai: null,
      },
      {
        base_id: "base", table_id: "table", record_id: "rec-2",
        fields_json: JSON.stringify({ "Issue Description": "no AI" }),
        ticket_ai: null,
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(JSON.parse(candidates[0].ticketAi)).toMatchObject({ fields: { "AI分析状态": "已分析" } });
  });

  it("requires explicit apply for writes", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });
});
