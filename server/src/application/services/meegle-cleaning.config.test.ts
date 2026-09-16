import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import { extractMeegleSystemRegion, getMeegleCleaningFieldKeys } from "./meegle-cleaning.config.js";

function makeWorkitem(type: string, fields: Array<{ key: string; value: unknown }>): MeegleWorkitem {
  return { id: "1", key: "WI-1", name: "System", type, status: "In Progress", fields: { work_item_fields: fields } };
}

describe("Meegle System cleaning", () => {
  it("prefers Story System over Relevant System", () => {
    expect(extractMeegleSystemRegion(makeWorkitem("story", [
      { key: "field_0dba3a", value: { label: "Portal UK" } },
      { key: "field_00f541", value: { label: "Odoo EU" } },
    ]))).toEqual({ present: true, value: "uk", warnings: [] });
  });

  it("falls back to Story Relevant System when the primary cannot identify a region", () => {
    expect(extractMeegleSystemRegion(makeWorkitem("story", [
      { key: "field_0dba3a", value: { label: "Other platform" } },
      { key: "field_00f541", value: [{ label: "Odoo US" }] },
    ]))).toEqual({ present: true, value: "us", warnings: [] });
  });

  it("reads Tech Task System directly without a linked Story", () => {
    expect(extractMeegleSystemRegion(makeWorkitem("66700acbf297a8f821b4b860", [
      { key: "field_6da66b", value: { label: "Portal EU" } },
    ]))).toEqual({ present: true, value: "eu", warnings: [] });
  });

  it("clears unrecognized nonempty values with a warning and clears empty values quietly", () => {
    const unrecognized = extractMeegleSystemRegion(makeWorkitem("66700acbf297a8f821b4b860", [
      { key: "field_6da66b", value: { label: "Mobile App" } },
    ]));
    expect(unrecognized.value).toBeNull();
    expect(unrecognized.warnings).toEqual([expect.objectContaining({
      errorCode: "MEEGLE_SYSTEM_REGION_UNRECOGNIZED",
      fieldKey: "field_6da66b",
    })]);
    expect(extractMeegleSystemRegion(makeWorkitem("66700acbf297a8f821b4b860", [])))
      .toEqual({ present: true, value: null, warnings: [] });
  });

  it("requests every configured source field through the metadata boundary", () => {
    expect(getMeegleCleaningFieldKeys("story")).toEqual(expect.arrayContaining(["field_0dba3a", "field_00f541"]));
    expect(getMeegleCleaningFieldKeys("66700acbf297a8f821b4b860")).toContain("field_6da66b");
    expect(getMeegleCleaningFieldKeys("6932e40429d1cd8aac635c82")).toContain("field_4976fc");
  });
});
