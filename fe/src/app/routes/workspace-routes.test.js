import assert from "node:assert/strict";
import test from "node:test";
import {
  appendWorkspaceBreadcrumb,
  getLarkTicketDetailHash,
  getWorkspaceRoute,
  INTEGRATIONS_ROUTE,
  INTEGRATIONS_SUBROUTES,
  WORKSPACE_NAVIGATION_ROUTES,
} from "./workspace-routes.js";

test("resolves each workspace hash to its page route", () => {
  assert.equal(getWorkspaceRoute("#meegle-workitems").page, "meegle-workitems");
  assert.equal(getWorkspaceRoute("#github-pull-requests").title, "GitHub PR");
  assert.equal(getWorkspaceRoute("#shortcuts").page, "shortcuts");
  assert.equal(getWorkspaceRoute("#sync").page, "sync");
});

test("uses the Integrations route for empty and unsupported hashes", () => {
  assert.equal(getWorkspaceRoute("").page, "integrations");
  assert.equal(getWorkspaceRoute("#settings"), INTEGRATIONS_ROUTE);
  assert.equal(getWorkspaceRoute("#settings-integrations"), INTEGRATIONS_ROUTE);
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

test("keeps sync and shortcut help as Integrations subpages", () => {
  assert.deepEqual(INTEGRATIONS_SUBROUTES.map((route) => route.page), ["integrations", "sync", "shortcuts"]);
  assert.equal(WORKSPACE_NAVIGATION_ROUTES.some((route) => route.page === "sync"), false);
  assert.equal(WORKSPACE_NAVIGATION_ROUTES.some((route) => route.page === "shortcuts"), false);
});

test("keeps no more than five workspace breadcrumbs and truncates when returning", () => {
  const trail = ["#lark-tickets", "#meegle-workitems", "#github-pull-requests", "#integrations", "#sync", "#shortcuts"]
    .reduce((current, hash) => appendWorkspaceBreadcrumb(current, getWorkspaceRoute(hash)), []);

  assert.deepEqual(trail.map((item) => item.hash), ["#meegle-workitems", "#github-pull-requests", "#integrations", "#sync", "#shortcuts"]);
  assert.deepEqual(
    appendWorkspaceBreadcrumb(trail, getWorkspaceRoute("#github-pull-requests")).map((item) => item.hash),
    ["#meegle-workitems", "#github-pull-requests"],
  );
});
