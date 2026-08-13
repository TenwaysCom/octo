import { parseArgs } from "./clean-meegle-sync-snapshots.js";
import {
  extractMeegleCleaningRelations,
  getMeegleCleaningFieldKeys,
} from "../application/services/meegle-cleaning.config.js";

describe("Meegle sync snapshot cleanup", () => {
  it("requires an explicit apply flag", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--unexpected"])).toThrow("Usage:");
  });

  it("extracts documented Meegle relationship fields for the Octo projection", () => {
    expect(extractMeegleCleaningRelations({
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
          { key: "field_00f541", value: { label: "Odoo/Odoo UK" } },
        ],
      },
    })).toEqual({
      sprint: "Sprint 1",
      version: "Version 1",
      bugs: ["Bug 1", "Bug 2"],
      system: "Odoo/Odoo UK",
    });
  });

  it("requests the Tech Task relation fields needed for cleaning", () => {
    expect(getMeegleCleaningFieldKeys("66700acbf297a8f821b4b860")).toEqual([
      "field_ecd063",
      "field_5fab52",
      "field_3daed9",
    ]);
  });
});
