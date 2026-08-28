import { projectMeegleSprintMembershipTransition } from "./meegle-sprint-membership.js";

const observedAt = "2026-08-27T12:00:00.000Z";

describe("Meegle Sprint membership transitions", () => {
  it("creates the first observed membership and clamps lifecycle times to its observed add time", () => {
    expect(projectMeegleSprintMembershipTransition({
      relation: { present: true, sprintId: "sprint-b" },
      lifecycle: {
        phase: "finished",
        itemStartTime: "2026-08-20T00:00:00.000Z",
        itemFinishTime: "2026-08-25T00:00:00.000Z",
      },
      observedAt,
    }).createOpen).toEqual({
      sprintId: "sprint-b",
      addedAt: observedAt,
      startedAt: observedAt,
      finishedAt: observedAt,
      source: "incremental_observed",
    });
  });

  it("keeps an inferred membership inferred and merges same-Sprint lifecycle changes", () => {
    const transition = projectMeegleSprintMembershipTransition({
      currentSnapshot: {
        sprintId: "sprint-a",
        addToCycleTime: "2026-08-01T00:00:00.000Z",
        itemStartTime: "2026-08-03T00:00:00.000Z",
      },
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: {
        phase: "finished",
        itemStartTime: "2026-08-04T00:00:00.000Z",
        itemFinishTime: "2026-08-10T00:00:00.000Z",
      },
      observedAt,
    });
    expect(transition.createOpen).toEqual({
      sprintId: "sprint-a",
      addedAt: "2026-08-01T00:00:00.000Z",
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-10T00:00:00.000Z",
      source: "historical_inferred",
    });
  });

  it("closes A and creates an independent observed B when the Sprint changes", () => {
    const transition = projectMeegleSprintMembershipTransition({
      openMembership: {
        sprintId: "sprint-a",
        addedAt: "2026-08-01T00:00:00.000Z",
        startedAt: "2026-08-03T00:00:00.000Z",
        finishedAt: null,
        source: "historical_inferred",
      },
      relation: { present: true, sprintId: "sprint-b" },
      lifecycle: { phase: "started", itemStartTime: "2026-08-04T00:00:00.000Z" },
      observedAt,
    });
    expect(transition.closeOpenAt).toBe(observedAt);
    expect(transition.createOpen).toEqual({
      sprintId: "sprint-b",
      addedAt: observedAt,
      startedAt: observedAt,
      finishedAt: null,
      source: "incremental_observed",
    });
  });

  it("closes an explicit removal but preserves a relation when the Sprint field is missing", () => {
    const openMembership = {
      sprintId: "sprint-a",
      addedAt: "2026-08-01T00:00:00.000Z",
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: null,
      source: "incremental_observed" as const,
    };
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: true },
      observedAt,
    })).toEqual({ closeOpenAt: observedAt });
    expect(projectMeegleSprintMembershipTransition({
      currentSnapshot: {
        sprintId: "sprint-a",
        addToCycleTime: "2026-08-01T00:00:00.000Z",
        itemStartTime: "2026-08-03T00:00:00.000Z",
      },
      relation: { present: true },
      lifecycle: { phase: "finished", itemFinishTime: "2026-08-27T00:00:00.000Z" },
      observedAt,
    }).createClosed).toMatchObject({
      sprintId: "sprint-a",
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: null,
      removedAt: observedAt,
      source: "historical_inferred",
    });
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: false },
      lifecycle: { phase: "finished", itemFinishTime: "2026-08-26T00:00:00.000Z" },
      observedAt,
    }).currentOpen).toEqual({
      ...openMembership,
      finishedAt: "2026-08-26T00:00:00.000Z",
    });
  });

  it("clears finish on reopen, clears both times on New, and creates a new segment after re-entry", () => {
    const openMembership = {
      sprintId: "sprint-a",
      addedAt: "2026-08-01T00:00:00.000Z",
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-10T00:00:00.000Z",
      source: "incremental_observed" as const,
    };
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { phase: "finished", itemFinishTime: null },
      observedAt,
    }).currentOpen).toMatchObject({ finishedAt: "2026-08-10T00:00:00.000Z" });
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { phase: "started" },
      observedAt,
    }).currentOpen).toMatchObject({ startedAt: "2026-08-03T00:00:00.000Z", finishedAt: null });
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { phase: "new" },
      observedAt,
    }).currentOpen).toMatchObject({ startedAt: null, finishedAt: null });
    expect(projectMeegleSprintMembershipTransition({
      currentSnapshot: {},
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { phase: "new" },
      observedAt,
    }).createOpen).toMatchObject({ sprintId: "sprint-a", addedAt: observedAt, source: "incremental_observed" });
  });
});
