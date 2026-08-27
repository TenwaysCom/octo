import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMeegleSprintHistory,
  buildMeegleSprintTimeline,
  filterMeegleSprintItems,
  getDefaultOpenMeegleSprint,
  getMeegleSprintLifecycle,
  summarizeMeegleSprint,
} from "./meegle-sprint-history.js";

const items = [
  { workItemId: "1", sprint: "Sprint 2", status: "Done", projectName: "Octo", priority: "P1", sourceUpdatedAt: "2026-08-27T09:00:00.000Z" },
  { workItemId: "2", sprint: "Sprint 2", status: "Doing", projectName: "Octo", priority: "P2", sourceUpdatedAt: "2026-08-27T08:00:00.000Z" },
  { workItemId: "3", sprint: "Sprint 1", status: "New", projectName: "Odoo", priority: "P1", sourceUpdatedAt: "2026-08-20T08:00:00.000Z" },
  { workItemId: "4", sprint: " ", status: "Done", projectName: "Octo", priority: "P1", sourceUpdatedAt: "2026-08-28T08:00:00.000Z" },
];

test("builds sprint history from synced workitems and sorts by latest activity", () => {
  const history = buildMeegleSprintHistory(items, [], new Date("2026-08-27T12:00:00.000Z"));
  assert.deepEqual(history.map((sprint) => sprint.name), ["Sprint 2", "Sprint 1"]);
  assert.deepEqual(history[0].progress, { scope: 2, started: 1, completed: 1, notStarted: 0, completionPercent: 50 });
  assert.equal(history[0].lifecycle, "unknown");
  assert.equal(history[0].projectCount, 1);
});

test("includes Sprint metadata without linked workitems and derives lifecycle from dates", () => {
  const history = buildMeegleSprintHistory(items, [{
    projectKey: "project",
    sprintId: "future",
    name: "Sprint 3",
    status: "Open",
    description: "Future delivery",
    startAt: "2026-09-10T00:00:00.000Z",
    endAt: "2026-09-24T00:00:00.000Z",
    syncedAt: "2026-08-27T00:00:00.000Z",
  }, {
    projectKey: "project",
    sprintId: "current",
    name: "Sprint 2",
    status: "In progress",
    startAt: "2026-08-20T00:00:00.000Z",
    endAt: "2026-09-03T00:00:00.000Z",
    syncedAt: "2026-08-27T00:00:00.000Z",
  }], new Date("2026-08-27T12:00:00.000Z"));
  assert.equal(history[0].name, "Sprint 3");
  assert.equal(history[0].progress.scope, 0);
  assert.equal(history[0].description, "Future delivery");
  assert.equal(history[0].lifecycle, "upcoming");
  assert.equal(history.find((sprint) => sprint.name === "Sprint 2").lifecycle, "current");
});

test("builds label counts without guessing lifecycle from workitem progress", () => {
  const sprint = summarizeMeegleSprint("Sprint X", [items[0]]);
  assert.equal(sprint.lifecycle, "unknown");
  assert.deepEqual(sprint.labels.sprint, [{ value: "Sprint 2", label: "Sprint 2", count: 1 }]);
  assert.deepEqual(sprint.labels.project, [{ value: "Octo", label: "Octo", count: 1 }]);
  assert.deepEqual(sprint.labels.priority, [{ value: "P1", label: "P1", count: 1 }]);
});

test("classifies Sprint dates with inclusive start and end days", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(getMeegleSprintLifecycle({ startAt: "2026-08-01", endAt: "2026-08-26" }, now), "past");
  assert.equal(getMeegleSprintLifecycle({ startAt: "2026-08-27", endAt: "2026-08-27" }, now), "current");
  assert.equal(getMeegleSprintLifecycle({ startAt: "2026-08-28", endAt: "2026-09-10" }, now), "upcoming");
  assert.equal(getMeegleSprintLifecycle({ startAt: "2026-08-01" }, now), "unknown");
  assert.equal(getMeegleSprintLifecycle({ startAt: "2026-09-10", endAt: "2026-08-10" }, now), "unknown");
});

test("selects the current Sprint as the default open row", () => {
  assert.equal(getDefaultOpenMeegleSprint([
    { name: "Sprint 3", lifecycle: "upcoming" },
    { name: "Sprint 2", lifecycle: "current" },
    { name: "Sprint 1", lifecycle: "past" },
  ]), "Sprint 2");
  assert.equal(getDefaultOpenMeegleSprint([{ name: "Sprint 1", lifecycle: "past" }]), undefined);
});

test("treats Start as new and Terminated as started under the requested three-way definition", () => {
  const sprint = summarizeMeegleSprint("Sprint X", [
    { sprint: "Sprint X", status: "Start" },
    { sprint: "Sprint X", status: "Terminated" },
  ]);
  assert.deepEqual(sprint.progress, { scope: 2, started: 1, completed: 0, notStarted: 1, completionPercent: 0 });
});

test("filters sprint workitems with OR inside one label and AND across labels", () => {
  assert.deepEqual(filterMeegleSprintItems(items, { project: ["Octo"], priority: ["P1", "P2"] }).map((item) => item.workItemId), ["1", "2", "4"]);
  assert.deepEqual(filterMeegleSprintItems(items, { project: ["Octo"], sprint: ["Sprint 2"] }).map((item) => item.workItemId), ["1", "2"]);
});

test("builds daily scope, active-started and completed counts from lifecycle timestamps", () => {
  const timeline = buildMeegleSprintTimeline({
    startAt: "2026-08-20T00:00:00.000Z",
    endAt: "2026-08-24T00:00:00.000Z",
    items: [{
      addToCycleTime: "2026-08-20T10:00:00.000Z",
      itemStartTime: "2026-08-21T10:00:00.000Z",
      itemFinishTime: "2026-08-23T10:00:00.000Z",
    }, {
      addToCycleTime: "2026-08-22T10:00:00.000Z",
      itemStartTime: "2026-08-22T11:00:00.000Z",
    }, {
      addToCycleTime: undefined,
      itemStartTime: "2026-08-20T11:00:00.000Z",
    }],
  }, new Date("2026-08-24T12:00:00.000Z"));
  assert.deepEqual(timeline.points, [
    { date: "2026-08-20", scope: 1, started: 0, completed: 0 },
    { date: "2026-08-21", scope: 1, started: 1, completed: 0 },
    { date: "2026-08-22", scope: 2, started: 2, completed: 0 },
    { date: "2026-08-23", scope: 2, started: 1, completed: 1 },
    { date: "2026-08-24", scope: 2, started: 1, completed: 1 },
  ]);
  assert.equal(timeline.coverageCount, 2);
});

test("counts items added before the sprint start in opening-day scope", () => {
  const timeline = buildMeegleSprintTimeline({
    startAt: "2026-08-20T00:00:00.000Z",
    endAt: "2026-08-20T00:00:00.000Z",
    items: [{ addToCycleTime: "2026-08-18T00:00:00.000Z" }],
  }, new Date("2026-08-20T12:00:00.000Z"));
  assert.deepEqual(timeline.points[0], { date: "2026-08-20", scope: 1, started: 0, completed: 0 });
});
