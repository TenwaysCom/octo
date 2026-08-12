import assert from "node:assert/strict";
import test from "node:test";
import { matchesLarkTicketQuickFilter } from "./lark-ticket-filters.js";

test("matches unclassified and unsynced Lark Ticket quick filters", () => {
  const unclassified = { issueType: "  ", meegleLink: "https://project.larksuite.com/workitem" };
  const unsyncedFeature = { issueType: "Feature", meegleLink: "  " };
  const syncedFeature = { issueType: "feature", meegleLink: "https://project.larksuite.com/workitem" };

  assert.equal(matchesLarkTicketQuickFilter(unclassified, "unclassified"), true);
  assert.equal(matchesLarkTicketQuickFilter(unsyncedFeature, "unsynced"), true);
  assert.equal(matchesLarkTicketQuickFilter(syncedFeature, "unsynced"), false);
  assert.equal(matchesLarkTicketQuickFilter(unclassified, "all"), true);
});
