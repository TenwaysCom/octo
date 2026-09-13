import {
  buildInferredCurrentMembership,
  classifyMeegleSprintMembership,
  projectMeegleSprintMembershipTransition,
} from "./meegle-sprint-membership.js";

const observedAt = "2026-08-27T12:00:00.000Z";

describe("Meegle Sprint membership transitions", () => {
  it("creates the first observed membership and clamps lifecycle times to its observed add time", () => {
    expect(projectMeegleSprintMembershipTransition({
      relation: { present: true, sprintId: "sprint-b" },
      lifecycle: {
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
        itemStartTime: "2026-08-04T00:00:00.000Z",
        itemFinishTime: "2026-08-10T00:00:00.000Z",
      },
      observedAt,
    });
    expect(transition.createOpen).toEqual({
      sprintId: "sprint-a",
      addedAt: "2026-08-01T00:00:00.000Z",
      startedAt: "2026-08-04T00:00:00.000Z",
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
      lifecycle: { itemStartTime: "2026-08-04T00:00:00.000Z" },
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
      lifecycle: { itemFinishTime: "2026-08-27T00:00:00.000Z" },
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
      lifecycle: { itemFinishTime: "2026-08-26T00:00:00.000Z" },
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
      lifecycle: { itemFinishTime: null },
      observedAt,
    }).currentOpen).toMatchObject({ finishedAt: null });
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { itemStartTime: "2026-08-03T00:00:00.000Z", itemFinishTime: null },
      observedAt,
    }).currentOpen).toMatchObject({ startedAt: "2026-08-03T00:00:00.000Z", finishedAt: null });
    expect(projectMeegleSprintMembershipTransition({
      openMembership,
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { itemStartTime: null, itemFinishTime: null },
      observedAt,
    }).currentOpen).toMatchObject({ startedAt: null, finishedAt: null });
    expect(projectMeegleSprintMembershipTransition({
      currentSnapshot: {},
      relation: { present: true, sprintId: "sprint-a" },
      lifecycle: { itemStartTime: null, itemFinishTime: null },
      observedAt,
    }).createOpen).toMatchObject({ sprintId: "sprint-a", addedAt: observedAt, source: "incremental_observed" });
  });
});

describe("Meegle Sprint membership transitions (A -> B finished)", () => {
  it("clamps an already-finished item entering the next Sprint to the observed add time", () => {
    const transition = projectMeegleSprintMembershipTransition({
      currentSnapshot: {
        sprintId: "sprint-a",
        addToCycleTime: "2026-08-01T00:00:00.000Z",
        itemStartTime: "2026-08-02T00:00:00.000Z",
        itemFinishTime: "2026-08-10T00:00:00.000Z",
      },
      relation: { present: true, sprintId: "sprint-b", sprintName: "Sprint B" },
      lifecycle: { itemFinishTime: "2026-08-10T00:00:00.000Z" },
      observedAt: "2026-08-16T00:00:00.000Z",
    });
    expect(transition.createClosed).toMatchObject({
      sprintId: "sprint-a",
      addedAt: "2026-08-01T00:00:00.000Z",
      startedAt: "2026-08-02T00:00:00.000Z",
      finishedAt: "2026-08-10T00:00:00.000Z",
      removedAt: "2026-08-16T00:00:00.000Z",
      source: "historical_inferred",
    });
    expect(transition.createOpen).toMatchObject({
      sprintId: "sprint-b",
      addedAt: "2026-08-16T00:00:00.000Z",
      startedAt: null,
      finishedAt: "2026-08-16T00:00:00.000Z",
      source: "incremental_observed",
    });
  });
});

describe("classifyMeegleSprintMembership", () => {
  const spans: Record<string, { startAt?: string; endAt?: string }> = {
    "sprint-a": { startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-14T00:00:00.000Z" },
    "sprint-b": { startAt: "2026-08-15T00:00:00.000Z", endAt: "2026-08-28T00:00:00.000Z" },
    "sprint-no-dates": {},
  };
  const getSpan = (sprintId: string) => spans[sprintId];

  it("classifies on-time observed entries as planned and late entries as after cycle", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-02T00:00:00.000Z", source: "incremental_observed" },
    ], 0, getSpan)).toEqual({ membershipClass: "planned", estimated: false });
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-05T00:00:00.000Z", source: "incremental_observed" },
    ], 0, getSpan)).toEqual({ membershipClass: "after_cycle", estimated: false });
  });

  it("keeps the grace window within 24 hours of the Sprint start", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-01T23:59:59.000Z", source: "incremental_observed" },
    ], 0, getSpan)).toMatchObject({ membershipClass: "planned" });
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-02T00:00:01.000Z", source: "incremental_observed" },
    ], 0, getSpan)).toMatchObject({ membershipClass: "after_cycle" });
  });

  it("marks timing classes as estimated for inferred memberships", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-03T00:00:00.000Z", source: "historical_inferred" },
    ], 0, getSpan)).toEqual({ membershipClass: "after_cycle", estimated: true });
  });

  it("classifies a transfer from an unfinished observed Sprint as carryover", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-01T00:00:00.000Z", finishedAt: null, source: "incremental_observed" },
      { sprintId: "sprint-b", addedAt: "2026-08-16T00:00:00.000Z", finishedAt: null, source: "incremental_observed" },
    ], 1, getSpan)).toEqual({
      membershipClass: "carryover",
      estimated: false,
      carriedOverFromSprintId: "sprint-a",
    });
  });

  it("returns unknown when the prior membership is inferred or its Sprint end date is missing", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-01T00:00:00.000Z", source: "historical_inferred" },
      { sprintId: "sprint-b", addedAt: "2026-08-16T00:00:00.000Z", source: "incremental_observed" },
    ], 1, getSpan)).toEqual({ membershipClass: "unknown", estimated: false });
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-no-dates", addedAt: "2026-08-01T00:00:00.000Z", source: "incremental_observed" },
      { sprintId: "sprint-b", addedAt: "2026-08-16T00:00:00.000Z", source: "incremental_observed" },
    ], 1, getSpan)).toEqual({ membershipClass: "unknown", estimated: false });
  });

  it("falls back to entry timing when the prior Sprint membership finished before its end", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: "2026-08-01T00:00:00.000Z", finishedAt: "2026-08-10T00:00:00.000Z", source: "incremental_observed" },
      { sprintId: "sprint-b", addedAt: "2026-08-20T00:00:00.000Z", source: "incremental_observed" },
    ], 1, getSpan)).toEqual({ membershipClass: "after_cycle", estimated: false });
  });

  it("returns unknown when entry time or Sprint start date is missing", () => {
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-no-dates", addedAt: "2026-08-10T00:00:00.000Z", source: "incremental_observed" },
    ], 0, getSpan)).toEqual({ membershipClass: "unknown", estimated: false });
    expect(classifyMeegleSprintMembership([
      { sprintId: "sprint-a", addedAt: null, source: "incremental_observed" },
    ], 0, getSpan)).toEqual({ membershipClass: "unknown", estimated: false });
  });
});

describe("buildInferredCurrentMembership", () => {
  it("prefers the stored add time and clamps lifecycle times to it", () => {
    expect(buildInferredCurrentMembership({
      sprintId: "sprint-a",
      addToCycleTime: "2026-08-05T00:00:00.000Z",
      workitemCreatedAt: "2026-07-01T00:00:00.000Z",
      sprintStartAt: "2026-08-01T00:00:00.000Z",
      itemStartTime: "2026-08-02T00:00:00.000Z",
      itemFinishTime: "2026-08-20T00:00:00.000Z",
    })).toEqual({
      sprintId: "sprint-a",
      addedAt: "2026-08-05T00:00:00.000Z",
      startedAt: "2026-08-05T00:00:00.000Z",
      finishedAt: "2026-08-20T00:00:00.000Z",
      source: "historical_inferred",
    });
  });

  it("falls back to max(workitem created time, Sprint start) for the add time", () => {
    expect(buildInferredCurrentMembership({
      sprintId: "sprint-a",
      workitemCreatedAt: "2026-08-10T00:00:00.000Z",
      sprintStartAt: "2026-08-01T00:00:00.000Z",
    })).toMatchObject({ addedAt: "2026-08-10T00:00:00.000Z", startedAt: null, finishedAt: null });
    expect(buildInferredCurrentMembership({
      sprintId: "sprint-a",
      workitemCreatedAt: null,
      sprintStartAt: "2026-08-01T00:00:00.000Z",
    })).toMatchObject({ addedAt: "2026-08-01T00:00:00.000Z" });
  });

  it("skips workitems without provable entry evidence", () => {
    expect(buildInferredCurrentMembership({ sprintId: "sprint-a" })).toBeUndefined();
    expect(buildInferredCurrentMembership({ sprintId: "" })).toBeUndefined();
  });
});
