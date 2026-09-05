import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MEEGLE_GROUP_BY,
  DEFAULT_MEEGLE_VISIBLE_COLUMNS,
  getDefaultMeegleCollapsedGroupKeys,
  groupMeegleWorkitems,
  normalizeMeegleGroupBy,
  normalizeMeegleSort,
  normalizeMeegleSubGroupBy,
  normalizeMeegleVisibleColumns,
  normalizeMeegleViewMode,
  sortMeegleWorkitems,
} from "./meegle-view-config.js";

test("normalizes Meegle view configuration without allowing the workitem column to disappear", () => {
  assert.deepEqual(normalizeMeegleVisibleColumns(undefined), DEFAULT_MEEGLE_VISIBLE_COLUMNS);
  assert.equal(DEFAULT_MEEGLE_VISIBLE_COLUMNS.includes("currentWorkingTime"), true);
  assert.equal(DEFAULT_MEEGLE_VISIBLE_COLUMNS.includes("createdAt"), true);
  assert.equal(DEFAULT_MEEGLE_VISIBLE_COLUMNS.includes("relatedPeople"), true);
  assert.deepEqual(normalizeMeegleVisibleColumns(["status", "unknown", "status"]), ["workitem", "status"]);
  assert.equal(normalizeMeegleGroupBy("sprint"), "sprint");
  assert.equal(normalizeMeegleGroupBy("none"), "none");
  assert.equal(DEFAULT_MEEGLE_GROUP_BY, "workitemType");
  assert.equal(normalizeMeegleGroupBy(undefined), "workitemType");
  assert.equal(normalizeMeegleGroupBy("unknown"), "workitemType");
  assert.equal(normalizeMeegleSubGroupBy("sprint", "status"), "sprint");
  assert.equal(normalizeMeegleSubGroupBy("status", "status"), "none");
  assert.equal(normalizeMeegleSubGroupBy("sprint", "none"), "none");
  assert.equal(normalizeMeegleViewMode("board"), "board");
  assert.equal(normalizeMeegleViewMode("unknown"), "list");
  assert.deepEqual(normalizeMeegleSort({ key: "sprint", direction: "asc" }), { key: "sprint", direction: "asc" });
  assert.deepEqual(normalizeMeegleSort({ key: "sprintVersion", direction: "asc" }), { key: "updatedAt", direction: "desc" });
});

test("defaults Meegle primary groups to collapsed without duplicate keys", () => {
  assert.deepEqual(getDefaultMeegleCollapsedGroupKeys([
    { key: "Story" },
    { key: "Tech Task" },
    { key: "Story" },
  ]), ["Story", "Tech Task"]);
  assert.deepEqual(getDefaultMeegleCollapsedGroupKeys([]), []);
});

test("sorts Meegle workitems by configured fields and leaves empty values last", () => {
  const items = [
    { workItemId: "2", sprint: "Sprint 10", sourceUpdatedAt: "2026-08-10T00:00:00Z" },
    { workItemId: "1", sprint: "Sprint 2", sourceUpdatedAt: "2026-08-12 00:00:00" },
    { workItemId: "3", sprint: "" },
    { workItemId: "4", sprint: "", sourceUpdatedAt: "invalid" },
  ];
  assert.deepEqual(sortMeegleWorkitems(items, { key: "sprint", direction: "asc" }).map((item) => item.workItemId), ["1", "2", "3", "4"]);
  assert.deepEqual(sortMeegleWorkitems(items, { key: "updatedAt", direction: "desc" }).map((item) => item.workItemId), ["1", "2", "3", "4"]);
  assert.deepEqual(sortMeegleWorkitems(items, { key: "updatedAt", direction: "asc" }).map((item) => item.workItemId), ["2", "1", "3", "4"]);
  assert.deepEqual(sortMeegleWorkitems([
    { workItemId: "2", createdAt: "2026-08-10T00:00:00Z" },
    { workItemId: "1", createdAt: "2026-08-01T00:00:00Z" },
    { workItemId: "3" },
  ], { key: "createdAt", direction: "asc" }).map((item) => item.workItemId), ["1", "2", "3"]);
});

test("groups sorted Meegle workitems by configured display value", () => {
  const groups = groupMeegleWorkitems([
    { workItemId: "1", status: "Doing" },
    { workItemId: "2", status: "" },
    { workItemId: "3", status: "Doing" },
  ], "status");
  assert.deepEqual(groups.map((group) => ({ label: group.label, ids: group.items.map((item) => item.workItemId) })), [
    { label: "Doing", ids: ["1", "3"] },
    { label: "未设置", ids: ["2"] },
  ]);
});

test("supports Meegle sub-groups and keeps empty configured groups when requested", () => {
  const allItems = [
    { workItemId: "1", status: "Doing", sprint: "Sprint 1" },
    { workItemId: "2", status: "Todo", sprint: "Sprint 2" },
  ];
  const groups = groupMeegleWorkitems([allItems[0]], "status", {
    subGroupBy: "sprint",
    showEmptyGroups: true,
    groupValues: allItems,
    subGroupValues: allItems,
  });
  assert.deepEqual(groups.map((group) => ({
    label: group.label,
    ids: group.items.map((item) => item.workItemId),
    subgroups: group.subgroups.map((subgroup) => ({ key: subgroup.key, subgroupKey: subgroup.subgroupKey, label: subgroup.label, ids: subgroup.items.map((item) => item.workItemId) })),
  })), [
    { label: "Doing", ids: ["1"], subgroups: [{ key: "Doing::Sprint 1", subgroupKey: "Sprint 1", label: "Sprint 1", ids: ["1"] }, { key: "Doing::Sprint 2", subgroupKey: "Sprint 2", label: "Sprint 2", ids: [] }] },
    { label: "Todo", ids: [], subgroups: [{ key: "Todo::Sprint 1", subgroupKey: "Sprint 1", label: "Sprint 1", ids: [] }, { key: "Todo::Sprint 2", subgroupKey: "Sprint 2", label: "Sprint 2", ids: [] }] },
  ]);
});
