import { LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD, normalizeLarkTimestamp } from "../adapters/lark/lark-timestamp.js";
import { parseArgs, summarizeSnapshots } from "./backfill-lark-source-updated-at.js";

describe("backfill-lark-source-updated-at", () => {
  it("defaults to a non-mutating preview and accepts only --apply", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--scope", "base/table"])).toThrow("Usage:");
  });

  it("recognizes numeric status record timestamps and excludes invalid snapshots", () => {
    expect(normalizeLarkTimestamp(1786020656000)).toBe("2026-08-06T12:50:56.000Z");
    expect(normalizeLarkTimestamp("2026-08-06T12:50:56Z")).toBe("2026-08-06T12:50:56.000Z");
    expect(normalizeLarkTimestamp("not-a-time")).toBeUndefined();
    expect(summarizeSnapshots([
      { base_id: "base", table_id: "table", source_updated_at: null, fields_json: JSON.stringify({ [LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD]: 1786020656000 }) },
      { base_id: "base", table_id: "table", source_updated_at: null, fields_json: JSON.stringify({ [LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD]: "bad" }) },
    ])).toEqual({
      candidates: 2,
      valid: 1,
      invalid: 1,
      scopes: [{ scope: "base/table", candidates: 2, valid: 1, invalid: 1 }],
    });
  });
});
