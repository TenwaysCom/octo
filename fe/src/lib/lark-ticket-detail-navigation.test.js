import assert from "node:assert/strict";
import test from "node:test";
import { sortLarkTickets } from "./lark-ticket-view-config.js";
import { createLarkTicketNavigationContext, getLarkTicketDetailNavigation } from "./lark-ticket-detail-navigation.js";

test("captures the loaded Lark Ticket sort order once, across list pages and groups", () => {
  const sortedTickets = sortLarkTickets([
    { recordId: "rec-review", ticketStatus: "Review" },
    { recordId: "rec-doing", ticketStatus: "Doing" },
    { recordId: "rec-empty", ticketStatus: "" },
  ]);

  assert.deepEqual(createLarkTicketNavigationContext([
    ...sortedTickets,
    { recordId: "rec-doing" },
    { recordId: "" },
  ]), {
    recordIds: ["rec-doing", "rec-review", "rec-empty"],
  });
});

test("resolves adjacent Tickets and exposes the current position", () => {
  const navigation = getLarkTicketDetailNavigation({
    navigationContext: { recordIds: ["rec-3", "rec-1", "rec-2"] },
    currentRecordId: "rec-1",
    availableRecordIds: ["rec-1", "rec-2", "rec-3"],
  });

  assert.deepEqual(navigation, {
    previousRecordId: "rec-3",
    nextRecordId: "rec-2",
    position: 2,
    total: 3,
  });
});

test("disables the unavailable side at the first and last Ticket", () => {
  const navigationContext = { recordIds: ["rec-1", "rec-2"] };

  assert.deepEqual(getLarkTicketDetailNavigation({
    navigationContext,
    currentRecordId: "rec-1",
    availableRecordIds: ["rec-1", "rec-2"],
  }), {
    previousRecordId: null,
    nextRecordId: "rec-2",
    position: 1,
    total: 2,
  });
  assert.deepEqual(getLarkTicketDetailNavigation({
    navigationContext,
    currentRecordId: "rec-2",
    availableRecordIds: ["rec-1", "rec-2"],
  }), {
    previousRecordId: "rec-1",
    nextRecordId: null,
    position: 2,
    total: 2,
  });
});

test("drops stale Tickets and hides navigation without a matching list context", () => {
  assert.deepEqual(getLarkTicketDetailNavigation({
    navigationContext: { recordIds: ["rec-1", "rec-gone", "rec-2"] },
    currentRecordId: "rec-2",
    availableRecordIds: ["rec-1", "rec-2"],
  }), {
    previousRecordId: "rec-1",
    nextRecordId: null,
    position: 2,
    total: 2,
  });
  assert.equal(getLarkTicketDetailNavigation({
    navigationContext: { recordIds: ["rec-1"] },
    currentRecordId: "rec-2",
    availableRecordIds: ["rec-1", "rec-2"],
  }), null);
});
