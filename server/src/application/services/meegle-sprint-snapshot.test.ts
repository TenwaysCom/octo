import {
  buildMeegleSprintSnapshot,
  buildMeegleSprintWorkitemProjections,
  getMeegleSprintDetailFieldKeys,
} from "./meegle-sprint-snapshot.js";

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

  it("keeps an unfinished observed workitem in its original Sprint and marks the later Sprint", () => {
    const base = {
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "story-1",
      title: "Carryover story",
      status: "Doing",
      membershipSource: "incremental_observed" as const,
      syncedAt: "2026-08-28T00:00:00.000Z",
    };
    const result = buildMeegleSprintWorkitemProjections([{
      ...base,
      sprintId: "sprint-a",
      addToCycleTime: "2026-08-01T00:00:00.000Z",
      itemStartTime: "2026-08-02T00:00:00.000Z",
      membershipRemovedAt: "2026-08-16T00:00:00.000Z",
    }, {
      ...base,
      sprintId: "sprint-b",
      addToCycleTime: "2026-08-16T00:00:00.000Z",
    }], [{
      projectKey: "project", sprintId: "sprint-a", name: "Sprint A",
      startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-14T00:00:00.000Z", syncedAt: "2026-08-28T00:00:00.000Z",
    }, {
      projectKey: "project", sprintId: "sprint-b", name: "Sprint B",
      startAt: "2026-08-15T00:00:00.000Z", endAt: "2026-08-28T00:00:00.000Z", syncedAt: "2026-08-28T00:00:00.000Z",
    }]);

    expect(result).toEqual([
      expect.objectContaining({ sprintId: "sprint-a", sprint: "Sprint A", carryoverToSprintId: "sprint-b", carryoverToSprintName: "Sprint B" }),
      expect.objectContaining({ sprintId: "sprint-b", sprint: "Sprint B" }),
    ]);
    expect(result[1]).not.toHaveProperty("carryoverToSprintId");
  });

  it("does not claim carryover for completed or historically inferred memberships", () => {
    const sprints = [{
      projectKey: "project", sprintId: "sprint-a", name: "Sprint A",
      startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-14T00:00:00.000Z", syncedAt: "2026-08-28T00:00:00.000Z",
    }, {
      projectKey: "project", sprintId: "sprint-b", name: "Sprint B",
      startAt: "2026-08-15T00:00:00.000Z", endAt: "2026-08-28T00:00:00.000Z", syncedAt: "2026-08-28T00:00:00.000Z",
    }];
    const makeMemberships = (source: "historical_inferred" | "incremental_observed", finish?: string) => [{
      projectKey: "project", workItemTypeKey: "story", workItemId: "story-1", title: "Story",
      sprintId: "sprint-a", addToCycleTime: "2026-08-01T00:00:00.000Z", itemFinishTime: finish,
      membershipSource: source, syncedAt: "2026-08-28T00:00:00.000Z",
    }, {
      projectKey: "project", workItemTypeKey: "story", workItemId: "story-1", title: "Story",
      sprintId: "sprint-b", addToCycleTime: "2026-08-15T00:00:00.000Z",
      membershipSource: "incremental_observed" as const, syncedAt: "2026-08-28T00:00:00.000Z",
    }];

    expect(buildMeegleSprintWorkitemProjections(makeMemberships("incremental_observed", "2026-08-10T00:00:00.000Z"), sprints)[0]).not.toHaveProperty("carryoverToSprintId");
    expect(buildMeegleSprintWorkitemProjections(makeMemberships("historical_inferred"), sprints)[0]).not.toHaveProperty("carryoverToSprintId");
  });
});
