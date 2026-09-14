import assert from "node:assert/strict";
import test from "node:test";
import { sortLarkTickets } from "./lark-ticket-view-config.js";
import {
  createLarkTicketNavigationContext,
  updateLarkTicketNavigationContext,
  getLarkTicketDetailNavigation,
  getLarkTicketFromNavigationContext,
} from "./lark-ticket-detail-navigation.js";

test("captures the loaded Lark Ticket sort order once, across list pages and groups", () => {
  const sortedTickets = sortLarkTickets([
    { recordId: "rec-review", ticketStatus: "Review" },
    { recordId: "rec-doing", ticketStatus: "Doing" },
    { recordId: "rec-empty", ticketStatus: "" },
  ]);

  const navigationContext = createLarkTicketNavigationContext([
    ...sortedTickets,
    { recordId: "rec-doing" },
    { recordId: "" },
  ]);

  assert.deepEqual(navigationContext.recordIds, ["rec-doing", "rec-review", "rec-empty"]);
  assert.deepEqual(navigationContext.tickets, sortedTickets);
});

test("resolves adjacent Tickets and exposes the current position", () => {
  const navigation = getLarkTicketDetailNavigation({
    navigationContext: { recordIds: ["rec-3", "rec-1", "rec-2"] },
    currentRecordId: "rec-1",
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
  }), {
    previousRecordId: null,
    nextRecordId: "rec-2",
    position: 1,
    total: 2,
  });
  assert.deepEqual(getLarkTicketDetailNavigation({
    navigationContext,
    currentRecordId: "rec-2",
  }), {
    previousRecordId: "rec-1",
    nextRecordId: null,
    position: 2,
    total: 2,
  });
});

test("uses the captured Ticket data and hides navigation without a matching list context", () => {
  const navigationContext = createLarkTicketNavigationContext([
    { recordId: "rec-1", title: "First" },
    { recordId: "rec-2", title: "Second" },
  ]);

  assert.deepEqual(getLarkTicketFromNavigationContext({ navigationContext, recordId: "rec-2" }), {
    recordId: "rec-2",
    title: "Second",
  });
  assert.equal(getLarkTicketFromNavigationContext({ navigationContext, recordId: "rec-missing" }), undefined);
  assert.deepEqual(getLarkTicketDetailNavigation({
    navigationContext,
    currentRecordId: "rec-2",
  }), {
    previousRecordId: "rec-1",
    nextRecordId: null,
    position: 2,
    total: 2,
  });
  assert.equal(getLarkTicketDetailNavigation({
    navigationContext,
    currentRecordId: "rec-missing",
  }), null);
});


test("keeps saved fields when navigating back without changing order or unrelated Ticket data", () => {
  const original = createLarkTicketNavigationContext([
    { baseId: "base_1", tableId: "table_1", recordId: "rec_1", ticketStatus: "Open", title: "First", sharedUrl: "https://example.com/ticket" },
    { baseId: "base_1", tableId: "table_1", recordId: "rec_2", ticketStatus: "Open" },
  ]);
  const patch = { baseId: "base_1", tableId: "table_1", recordId: "rec_1", ticketStatus: "Done" };
  const updated = updateLarkTicketNavigationContext(original, patch);
  assert.deepEqual(updated.recordIds, original.recordIds);
  assert.equal(updated.tickets[1], original.tickets[1]);
  assert.equal(original.tickets[0].ticketStatus, "Open");
  assert.deepEqual(getLarkTicketFromNavigationContext({ navigationContext: updated, recordId: "rec_1" }), {
    ...original.tickets[0], ticketStatus: "Done",
  });
  assert.deepEqual(updateLarkTicketNavigationContext(original, { ...patch, tableId: "other" }), original);
  assert.equal(updateLarkTicketNavigationContext(null, patch), null);
});
