import { extractRelationValues, parseArgs } from "./clean-meegle-sync-snapshots.js";

describe("Meegle sync snapshot cleanup", () => {
  it("requires an explicit apply flag", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--unexpected"])).toThrow("Usage:");
  });

  it("extracts only the selected Story relationship fields", () => {
    const result = extractRelationValues({
      id: "1",
      key: "",
      name: "Story",
      type: "story",
      status: "Start",
      fields: {
        work_item_fields: [
          { key: "field_feb079", value: { id: 1, name: "Sprint 1" } },
          { key: "field_1b9eb0", value: { id: 2, name: "Version 1" } },
          { key: "field_9edc03", value: [{ id: 3, name: "Bug 1" }, { id: 4, name: "Bug 2" }] },
          { key: "field_00f541", value: { label: "Odoo/Odoo UK", value: "wjuvtyuqx" } },
          { key: "field_41a91c", value: { id: 5, name: "Actual version" } },
        ],
      },
    }, {
      sprint: "field_feb079",
      version: "field_1b9eb0",
      bugs: "field_9edc03",
      system: "field_00f541",
    });

    expect(result).toEqual({
      sprint: "Sprint 1",
      version: "Version 1",
      bugs: ["Bug 1", "Bug 2"],
      system: "Odoo/Odoo UK",
    });
  });
});
