import { buildMeegleSprintSnapshot, getMeegleSprintDetailFieldKeys } from "./meegle-sprint-snapshot.js";

describe("Meegle Sprint snapshot projection", () => {
  it("projects description and schedule from the centrally configured Sprint fields", () => {
    const result = buildMeegleSprintSnapshot({
      projectKey: "project",
      projectName: "Tenways",
      workItemTypeKey: "642ebe04168eea39eeb0d34a",
      workItemId: "123",
      title: "Odoo Sprint 20260820",
      statusKey: "In Progress",
      status: "In progress",
      sourceUpdatedAt: "2026-08-26T06:42:58.000Z",
      syncedAt: "2026-08-27T01:00:00.000Z",
      sourcePayload: {
        id: "123",
        key: "",
        name: "Odoo Sprint 20260820",
        type: "642ebe04168eea39eeb0d34a",
        status: "In progress",
        fields: {
          work_item_fields: [
            { key: "description", value: "本期交付重点" },
            { key: "field_3729d1", value: {
              start_time: { iso_time: "2026-08-06T16:00:00Z" },
              end_time: { timestamp: 1787241599000 },
            } },
          ],
        },
      },
    });
    expect(result).toMatchObject({
      sprintId: "123",
      name: "Odoo Sprint 20260820",
      description: "本期交付重点",
      startAt: "2026-08-06T16:00:00.000Z",
      endAt: "2026-08-20T15:59:59.000Z",
    });
  });

  it("does not request Sprint-only fields for ordinary workitems", () => {
    expect(getMeegleSprintDetailFieldKeys("story")).toEqual([]);
    expect(getMeegleSprintDetailFieldKeys("642ebe04168eea39eeb0d34a")).toEqual(["description", "field_3729d1"]);
  });
});
