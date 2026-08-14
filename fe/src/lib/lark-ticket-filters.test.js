import assert from "node:assert/strict";
import test from "node:test";
import { matchesLarkTicketQuickFilter } from "./lark-ticket-filters.js";

test("matches in-progress, unclassified and unsynced Lark Ticket quick filters", () => {
  const inProgress = { ticketStatus: "In Progress", issueType: "Feature" };
  const inDevelopment = { ticketStatus: "开发中", issueType: "Feature" };
  const inReview = { ticketStatus: "Review", issueType: "Feature" };
  const withoutStatus = { ticketStatus: "", issueType: "Feature" };
  const unclassified = { issueType: "  ", meegleLink: "https://project.larksuite.com/workitem" };
  const unsyncedFeature = { issueType: "Feature", meegleLink: "  " };
  const syncedFeature = { issueType: "feature", meegleLink: "https://project.larksuite.com/workitem" };

  assert.equal(matchesLarkTicketQuickFilter(inProgress, "in-progress"), true);
  assert.equal(matchesLarkTicketQuickFilter(inDevelopment, "in-progress"), true);
  assert.equal(matchesLarkTicketQuickFilter(inReview, "in-progress"), true);
  assert.equal(matchesLarkTicketQuickFilter(withoutStatus, "in-progress"), true);
  for (const ticketStatus of ["Finish", " cancelled ", "REJECTED"]) {
    assert.equal(matchesLarkTicketQuickFilter({ ticketStatus }, "in-progress"), false);
  }
  assert.equal(matchesLarkTicketQuickFilter(unclassified, "unclassified"), true);
  assert.equal(matchesLarkTicketQuickFilter(unsyncedFeature, "unsynced"), true);
  assert.equal(matchesLarkTicketQuickFilter(syncedFeature, "unsynced"), false);
  assert.equal(matchesLarkTicketQuickFilter(unclassified, "all"), true);
});
