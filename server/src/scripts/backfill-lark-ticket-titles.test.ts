import { findTitleUpdates, parseArgs } from "./backfill-lark-ticket-titles.js";

describe("backfill Lark ticket titles", () => {
  it("uses Issue Description and changes only stale titles", () => {
    expect(findTitleUpdates([
      { base_id: "base", table_id: "table", record_id: "rec-1", title: "rec-1", fields_json: JSON.stringify({ "Issue Description": "Actual title" }) },
      { base_id: "base", table_id: "table", record_id: "rec-2", title: "Correct", fields_json: JSON.stringify({ "Issue Description": "Correct" }) },
      { base_id: "base", table_id: "table", record_id: "rec-3", title: "rec-3", fields_json: "invalid" },
    ])).toEqual([{ baseId: "base", tableId: "table", recordId: "rec-1", title: "Actual title" }]);
  });

  it("requires explicit apply for writes", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--all"])).toThrow("Usage:");
  });
});
