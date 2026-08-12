import assert from "node:assert/strict";
import test from "node:test";
import {
  getLarkTicketDetailHash,
  getWorkspaceRoute,
  SETTINGS_ROUTE,
  SETTINGS_SUBROUTES,
  WORKSPACE_NAVIGATION_ROUTES,
} from "./workspace-routes.js";

test("resolves each workspace hash to its page route", () => {
  assert.equal(getWorkspaceRoute("#meegle-workitems").page, "meegle-workitems");
  assert.equal(getWorkspaceRoute("#github-pull-requests").title, "GitHub PR");
  assert.equal(getWorkspaceRoute("#shortcuts").page, "shortcuts");
});

test("uses the settings route for empty and unsupported hashes", () => {
  assert.equal(getWorkspaceRoute("").page, "settings");
  assert.equal(getWorkspaceRoute("#settings-integrations"), SETTINGS_ROUTE);
});

test("resolves a Lark Ticket detail deep link", () => {
  const hash = getLarkTicketDetailHash("rec ticket/1");
  assert.equal(hash, "#lark-tickets/rec%20ticket%2F1");
  assert.deepEqual(getWorkspaceRoute(hash), {
    page: "lark-ticket-detail",
    hash,
    title: "Lark Ticket",
    ticketRecordId: "rec ticket/1",
  });
});

test("keeps shortcut help as a Settings subpage", () => {
  assert.deepEqual(SETTINGS_SUBROUTES.map((route) => route.page), ["settings", "shortcuts"]);
  assert.equal(WORKSPACE_NAVIGATION_ROUTES.some((route) => route.page === "shortcuts"), false);
});
