import assert from "node:assert/strict";
import test from "node:test";
import { buildMeegleSprintHistory, filterMeegleSprintItems, summarizeMeegleSprint } from "./meegle-sprint-history.js";

const items = [
  { workItemId: "1", sprint: "Sprint 2", status: "Done", projectName: "Octo", priority: "P1", sourceUpdatedAt: "2026-08-27T09:00:00.000Z" },
  { workItemId: "2", sprint: "Sprint 2", status: "Doing", projectName: "Octo", priority: "P2", sourceUpdatedAt: "2026-08-27T08:00:00.000Z" },
  { workItemId: "3", sprint: "Sprint 1", status: "New", projectName: "Odoo", priority: "P1", sourceUpdatedAt: "2026-08-20T08:00:00.000Z" },
  { workItemId: "4", sprint: " ", status: "Done", projectName: "Octo", priority: "P1", sourceUpdatedAt: "2026-08-28T08:00:00.000Z" },
];

test("builds sprint history from synced workitems and sorts by latest activity", () => {
  const history = buildMeegleSprintHistory(items);
  assert.deepEqual(history.map((sprint) => sprint.name), ["Sprint 2", "Sprint 1"]);
  assert.deepEqual(history[0].progress, { scope: 2, started: 1, completed: 1, notStarted: 0, completionPercent: 50 });
  assert.equal(history[0].activity, "active");
  assert.equal(history[0].projectCount, 1);
});

test("includes Sprint metadata without linked workitems and prefers real status and dates", () => {
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
    syncedAt: "2026-08-27T00:00:00.000Z",
  }]);
  assert.equal(history[0].name, "Sprint 3");
  assert.equal(history[0].progress.scope, 0);
  assert.equal(history[0].description, "Future delivery");
  assert.equal(history[0].activity, "planned");
  assert.equal(history.find((sprint) => sprint.name === "Sprint 2").activity, "active");
});

test("marks an all-completed sprint and builds label counts", () => {
  const sprint = summarizeMeegleSprint("Sprint X", [items[0]]);
  assert.equal(sprint.activity, "completed");
  assert.deepEqual(sprint.labels.sprint, [{ value: "Sprint 2", label: "Sprint 2", count: 1 }]);
  assert.deepEqual(sprint.labels.project, [{ value: "Octo", label: "Octo", count: 1 }]);
  assert.deepEqual(sprint.labels.priority, [{ value: "P1", label: "P1", count: 1 }]);
});

test("filters sprint workitems with OR inside one label and AND across labels", () => {
  assert.deepEqual(filterMeegleSprintItems(items, { project: ["Octo"], priority: ["P1", "P2"] }).map((item) => item.workItemId), ["1", "2", "4"]);
  assert.deepEqual(filterMeegleSprintItems(items, { project: ["Octo"], sprint: ["Sprint 2"] }).map((item) => item.workItemId), ["1", "2"]);
});
