import assert from "node:assert/strict";
import test from "node:test";
import {
  countFilterValues,
  matchesSelectedDateFilters,
  matchesSelectedSprints,
  matchesSelectedTagFilters,
  normalizeFilterValues,
  toggleFilterValue,
} from "./platform-list-filters.js";

test("normalizes persisted filter values and toggles multiple selections", () => {
  assert.deepEqual(normalizeFilterValues(["today", "today", 3, ""]), ["today"]);
  assert.deepEqual(normalizeFilterValues(undefined, ["last-7-days"]), ["last-7-days"]);
  assert.deepEqual(toggleFilterValue(["today"], "last-7-days"), ["today", "last-7-days"]);
  assert.deepEqual(toggleFilterValue(["today", "last-7-days"], "today"), ["last-7-days"]);
});

test("matches the union of selected date values and selected sprints", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(matchesSelectedDateFilters({ sourceUpdatedAt: "2026-08-27T01:00:00.000Z" }, ["today"], now), true);
  assert.equal(matchesSelectedDateFilters({ sourceUpdatedAt: "2026-08-20T12:00:00.000Z" }, ["today", "last-7-days"], now), true);
  assert.equal(matchesSelectedDateFilters({ sourceUpdatedAt: "2026-07-20T12:00:00.000Z" }, ["today", "last-7-days"], now), false);
  assert.equal(matchesSelectedSprints({ sprint: "Sprint 1" }, ["Sprint 1", "Sprint 2"]), true);
  assert.equal(matchesSelectedSprints({ sprint: "Sprint 3" }, ["Sprint 1", "Sprint 2"]), false);
  assert.equal(matchesSelectedSprints({ sprint: "Sprint 3" }, []), true);
});

test("counts sidebar tags and combines selections across fields", () => {
  const fields = [
    { key: "project", getValues: (item) => [item.project] },
    { key: "assignee", getValues: (item) => item.assignees.split(",") },
  ];
  assert.deepEqual(countFilterValues([
    { project: "Octo", assignees: "Ada,Bob" },
    { project: "Octo", assignees: "Ada" },
    { project: "", assignees: "" },
  ], fields[0].getValues), [{ value: "Octo", label: "Octo", count: 2 }]);
  assert.equal(matchesSelectedTagFilters({ project: "Octo", assignees: "Ada,Bob" }, fields, { project: ["Octo"], assignee: ["Bob"] }), true);
  assert.equal(matchesSelectedTagFilters({ project: "Octo", assignees: "Ada" }, fields, { project: ["Octo"], assignee: ["Bob"] }), false);
});
