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
  assert.equal(DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS.includes("version"), true);
  assert.equal(DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS.includes("pullRequests"), true);
  assert.deepEqual(normalizeSprintWorkitemVisibleColumns(["pullRequests"]), ["workitem", "pullRequests"]);
  assert.deepEqual(normalizeSprintWorkitemVisibleColumns(["status", "unknown", "status"]), ["workitem", "status"]);
  assert.deepEqual(normalizeSprintWorkitemSort({ key: "version", direction: "asc" }), { key: "version", direction: "asc" });
  assert.deepEqual(normalizeSprintWorkitemSort({ key: "priority", direction: "asc" }), { key: "priority", direction: "asc" });
  assert.deepEqual(normalizeSprintWorkitemSort({ key: "sprint", direction: "asc" }), { key: "updatedAt", direction: "desc" });
  assert.equal(normalizeSprintWorkitemGroupBy("status"), "status");
  assert.equal(normalizeSprintWorkitemGroupBy("version"), "version");
  assert.equal(normalizeSprintWorkitemGroupBy("sprint"), "none");
  assert.equal(normalizeSprintWorkitemSubGroupBy("project", "status"), "project");
  assert.equal(normalizeSprintWorkitemSubGroupBy("status", "status"), "none");
  assert.equal(normalizeSprintWorkitemSubGroupBy("project", "none"), "none");
});

test("groups Sprint workitems by Version as a primary or secondary field", () => {
  const items = [
    { workItemId: "1", status: "Doing", version: "2.11.0" },
    { workItemId: "2", status: "Done", version: "2.11.0" },
    { workItemId: "3", status: "Doing", version: "" },
  ];

  const versionGroups = groupSprintWorkitems(items, "version");
  assert.deepEqual(versionGroups.map((group) => ({
    label: group.label,
    ids: group.items.map((item) => item.workItemId),
  })), [
    { label: "2.11.0", ids: ["1", "2"] },
    { label: "未设置", ids: ["3"] },
  ]);

  const statusGroups = groupSprintWorkitems(items, "status", { subGroupBy: "version" });
  assert.deepEqual(statusGroups.map((group) => ({
    label: group.label,
    subgroups: group.subgroups.map((subgroup) => ({ label: subgroup.label, ids: subgroup.items.map((item) => item.workItemId) })),
  })), [
    { label: "Doing", subgroups: [{ label: "2.11.0", ids: ["1"] }, { label: "未设置", ids: ["3"] }] },
    { label: "Done", subgroups: [{ label: "2.11.0", ids: ["2"] }] },
  ]);
});

test("sorts Sprint workitems by configured workitem fields", () => {
  const items = [
    { workItemId: "2", priority: "P2", version: "2.11.0", sourceUpdatedAt: "2026-08-20T00:00:00Z" },
    { workItemId: "1", priority: "P1", version: "2.10.0", sourceUpdatedAt: "2026-08-22T00:00:00Z" },
    { workItemId: "3", priority: "" },
  ];
  assert.deepEqual(sortSprintWorkitems(items, { key: "priority", direction: "asc" }).map((item) => item.workItemId), ["1", "2", "3"]);
  assert.deepEqual(sortSprintWorkitems(items, { key: "version", direction: "asc" }).map((item) => item.workItemId), ["1", "2", "3"]);
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
