import { parseArgs } from "./clean-meegle-sync-snapshots.js";
import {
  extractMeegleCleaningRelations,
  extractMeegleSprintRelation,
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
    });
  });

  it("requests the Tech Task relation and Team fields needed for snapshot cleaning", () => {
    expect(getMeegleCleaningFieldKeys("66700acbf297a8f821b4b860")).toEqual([
      "field_ecd063",
      "field_5fab52",
      "field_3daed9",
      "field_6da66b",
      "field_7c2f56",
    ]);
  });

  it("requests the Production Bug relation and Team fields needed for snapshot cleaning", () => {
    expect(getMeegleCleaningFieldKeys("6932e40429d1cd8aac635c82")).toEqual([
      "field_ee999e",
      "field_c6f6d0",
      "field_4976fc",
      "field_26ef68",
    ]);
  });

  it("extracts the stable Sprint id separately from its display name", () => {
    expect(extractMeegleSprintRelation({
      id: "1",
      key: "",
      name: "Story",
      type: "story",
      status: "Start",
      fields: {
        work_item_fields: [
          { key: "field_feb079", value: [{ id: "sprint-1", name: "Sprint 1" }] },
        ],
      },
    })).toEqual({ present: true, sprintId: "sprint-1", sprintName: "Sprint 1" });
  });

  it("distinguishes an unavailable Sprint field from an explicitly empty relation", () => {
    const workitem = {
      id: "1",
      key: "",
      name: "Story",
      type: "story",
      status: "Start",
    };
    expect(extractMeegleSprintRelation({ ...workitem, fields: {} })).toEqual({ present: false });
    expect(extractMeegleSprintRelation({ ...workitem, fields: { work_item_fields: [] } })).toEqual({ present: true });
  });
});
