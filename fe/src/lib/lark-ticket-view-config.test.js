import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LARK_TICKET_SORT,
  DEFAULT_LARK_TICKET_VISIBLE_COLUMNS,
  groupLarkTickets,
  normalizeLarkTicketGroupBy,
  normalizeLarkTicketSort,
  normalizeLarkTicketSubGroupBy,
  normalizeLarkTicketVisibleColumns,
  normalizeLarkTicketViewMode,
  sortLarkTickets,
} from "./lark-ticket-view-config.js";

test("normalizes Lark Ticket view configuration and keeps the Ticket column visible", () => {
  assert.deepEqual(normalizeLarkTicketVisibleColumns(undefined), DEFAULT_LARK_TICKET_VISIBLE_COLUMNS);
  assert.deepEqual(normalizeLarkTicketVisibleColumns(["status", "unknown", "status"]), ["title", "status"]);
  assert.equal(normalizeLarkTicketGroupBy("requester"), "requester");
  assert.equal(normalizeLarkTicketGroupBy("none"), "none");
  assert.equal(normalizeLarkTicketGroupBy("unknown"), "status");
  assert.equal(normalizeLarkTicketSubGroupBy("priority", "status"), "priority");
  assert.equal(normalizeLarkTicketSubGroupBy("status", "status"), "none");
  assert.equal(normalizeLarkTicketSubGroupBy("priority", "none"), "none");
  assert.equal(normalizeLarkTicketViewMode("board"), "board");
  assert.equal(normalizeLarkTicketViewMode("unknown"), "list");
  assert.deepEqual(normalizeLarkTicketSort(undefined), DEFAULT_LARK_TICKET_SORT);
  assert.deepEqual(normalizeLarkTicketSort({ key: "priority", direction: "desc" }), { key: "priority", direction: "desc" });
});

test("sorts Lark Tickets by status by default and leaves missing values last", () => {
  const items = [
    { recordId: "3", ticketStatus: "Review", sourceUpdatedAt: "2026-08-10T00:00:00Z" },
    { recordId: "1", ticketStatus: "Doing", sourceUpdatedAt: "2026-08-12T00:00:00Z" },
    { recordId: "2", ticketStatus: "" },
  ];
  assert.deepEqual(sortLarkTickets(items, undefined).map((item) => item.recordId), ["1", "3", "2"]);
  assert.deepEqual(sortLarkTickets(items, { key: "updatedAt", direction: "desc" }).map((item) => item.recordId), ["1", "3", "2"]);
});

test("groups Lark Tickets by the configured field", () => {
  const groups = groupLarkTickets([
    { recordId: "1", requester: "Alice" },
    { recordId: "2", requester: "" },
    { recordId: "3", requester: "Alice" },
  ], "requester");
  assert.deepEqual(groups.map((group) => ({ label: group.label, ids: group.items.map((item) => item.recordId) })), [
    { label: "Alice", ids: ["1", "3"] },
    { label: "未设置", ids: ["2"] },
  ]);
});

test("supports Lark Ticket sub-groups and keeps empty configured groups when requested", () => {
  const allItems = [
    { recordId: "1", ticketStatus: "Doing", priority: "High" },
    { recordId: "2", ticketStatus: "Todo", priority: "Low" },
  ];
  const groups = groupLarkTickets([allItems[0]], "status", {
    subGroupBy: "priority",
    showEmptyGroups: true,
    groupValues: allItems,
    subGroupValues: allItems,
  });
  assert.deepEqual(groups.map((group) => ({
    label: group.label,
    ids: group.items.map((item) => item.recordId),
    subgroups: group.subgroups.map((subgroup) => ({ key: subgroup.key, subgroupKey: subgroup.subgroupKey, label: subgroup.label, ids: subgroup.items.map((item) => item.recordId) })),
  })), [
    { label: "Doing", ids: ["1"], subgroups: [{ key: "Doing::High", subgroupKey: "High", label: "High", ids: ["1"] }, { key: "Doing::Low", subgroupKey: "Low", label: "Low", ids: [] }] },
    { label: "Todo", ids: [], subgroups: [{ key: "Todo::High", subgroupKey: "High", label: "High", ids: [] }, { key: "Todo::Low", subgroupKey: "Low", label: "Low", ids: [] }] },
  ]);
});
