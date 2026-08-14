import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MEEGLE_VISIBLE_COLUMNS,
  groupMeegleWorkitems,
  normalizeMeegleGroupBy,
  normalizeMeegleSort,
  normalizeMeegleVisibleColumns,
  sortMeegleWorkitems,
} from "./meegle-view-config.js";

test("normalizes Meegle view configuration without allowing the workitem column to disappear", () => {
  assert.deepEqual(normalizeMeegleVisibleColumns(undefined), DEFAULT_MEEGLE_VISIBLE_COLUMNS);
  assert.deepEqual(normalizeMeegleVisibleColumns(["status", "unknown", "status"]), ["workitem", "status"]);
  assert.equal(normalizeMeegleGroupBy("sprint"), "sprint");
  assert.equal(normalizeMeegleGroupBy("none"), "none");
  assert.equal(normalizeMeegleGroupBy("unknown"), "status");
  assert.deepEqual(normalizeMeegleSort({ key: "sprint", direction: "asc" }), { key: "sprint", direction: "asc" });
  assert.deepEqual(normalizeMeegleSort({ key: "sprintVersion", direction: "asc" }), { key: "updatedAt", direction: "desc" });
});

test("sorts Meegle workitems by configured fields and leaves empty values last", () => {
  const items = [
    { workItemId: "2", sprint: "Sprint 10", sourceUpdatedAt: "2026-08-10T00:00:00Z" },
    { workItemId: "1", sprint: "Sprint 2", sourceUpdatedAt: "2026-08-12T00:00:00Z" },
    { workItemId: "3", sprint: "" },
    { workItemId: "4", sprint: "", sourceUpdatedAt: "invalid" },
  ];
  assert.deepEqual(sortMeegleWorkitems(items, { key: "sprint", direction: "asc" }).map((item) => item.workItemId), ["1", "2", "3", "4"]);
  assert.deepEqual(sortMeegleWorkitems(items, { key: "updatedAt", direction: "desc" }).map((item) => item.workItemId), ["1", "2", "3", "4"]);
  assert.deepEqual(sortMeegleWorkitems(items, { key: "updatedAt", direction: "asc" }).map((item) => item.workItemId), ["2", "1", "3", "4"]);
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
