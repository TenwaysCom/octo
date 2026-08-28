import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS,
  groupSprintWorkitems,
  normalizeSprintWorkitemGroupBy,
  normalizeSprintWorkitemSort,
  normalizeSprintWorkitemSubGroupBy,
  normalizeSprintWorkitemVisibleColumns,
  sortSprintWorkitems,
} from "./meegle-sprint-workitem-view.js";

test("normalizes Sprint workitem view settings without hiding the workitem column", () => {
  assert.deepEqual(normalizeSprintWorkitemVisibleColumns(undefined), DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS);
  assert.deepEqual(normalizeSprintWorkitemVisibleColumns(["status", "unknown", "status"]), ["workitem", "status"]);
  assert.deepEqual(normalizeSprintWorkitemSort({ key: "priority", direction: "asc" }), { key: "priority", direction: "asc" });
  assert.deepEqual(normalizeSprintWorkitemSort({ key: "sprint", direction: "asc" }), { key: "updatedAt", direction: "desc" });
  assert.equal(normalizeSprintWorkitemGroupBy("status"), "status");
  assert.equal(normalizeSprintWorkitemGroupBy("sprint"), "none");
  assert.equal(normalizeSprintWorkitemSubGroupBy("project", "status"), "project");
  assert.equal(normalizeSprintWorkitemSubGroupBy("status", "status"), "none");
  assert.equal(normalizeSprintWorkitemSubGroupBy("project", "none"), "none");
});

test("sorts Sprint workitems by configured workitem fields", () => {
  const items = [
    { workItemId: "2", priority: "P2", sourceUpdatedAt: "2026-08-20T00:00:00Z" },
    { workItemId: "1", priority: "P1", sourceUpdatedAt: "2026-08-22T00:00:00Z" },
    { workItemId: "3", priority: "" },
  ];
  assert.deepEqual(sortSprintWorkitems(items, { key: "priority", direction: "asc" }).map((item) => item.workItemId), ["1", "2", "3"]);
  assert.deepEqual(sortSprintWorkitems(items, { key: "updatedAt", direction: "desc" }).map((item) => item.workItemId), ["1", "2", "3"]);
});

test("groups Sprint workitems by the configured primary and secondary fields", () => {
  const groups = groupSprintWorkitems([
    { workItemId: "1", status: "Doing", projectName: "Octo" },
    { workItemId: "2", status: "Doing", projectName: "Odoo" },
    { workItemId: "3", status: "Done", projectName: "Octo" },
  ], "status", { subGroupBy: "project" });
  assert.deepEqual(groups.map((group) => ({
    label: group.label,
    ids: group.items.map((item) => item.workItemId),
    subgroups: group.subgroups.map((subgroup) => ({ label: subgroup.label, ids: subgroup.items.map((item) => item.workItemId) })),
  })), [
    { label: "Doing", ids: ["1", "2"], subgroups: [{ label: "Octo", ids: ["1"] }, { label: "Odoo", ids: ["2"] }] },
    { label: "Done", ids: ["3"], subgroups: [{ label: "Octo", ids: ["3"] }] },
  ]);
});
