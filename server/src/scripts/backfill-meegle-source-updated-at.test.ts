import { extractCandidates, parseArgs } from "./backfill-meegle-source-updated-at.js";

describe("backfill-meegle-source-updated-at", () => {
  it("defaults to preview and accepts only --apply", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--project", "4c3fv6"])).toThrow("Usage:");
  });

  it("uses Production Bug update_time for historical source timestamps", () => {
    expect(extractCandidates([{
      project_key: "project",
      work_item_type_key: "6932e40429d1cd8aac635c82",
      work_item_id: "1",
      payload_json: JSON.stringify({
        type: "6932e40429d1cd8aac635c82",
        fields: { work_item_attribute: { update_time: "1785920000000" } },
      }),
    }])).toMatchObject({
      invalid: 0,
      scopes: [{ scope: "project", candidates: 1, valid: 1, invalid: 0 }],
      valid: [{ projectKey: "project", workItemTypeKey: "6932e40429d1cd8aac635c82", workItemId: "1", sourceUpdatedAt: "2026-08-05T08:53:20.000Z" }],
    });
  });
});
