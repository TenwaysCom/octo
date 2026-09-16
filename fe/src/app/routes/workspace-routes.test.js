import assert from "node:assert/strict";
import test from "node:test";
import {
  appendWorkspaceBreadcrumb,
  canAccessWorkspaceRoute,
  getDefaultSettingsRoute,
  getIntegrationsSubroutes,
  getLarkTicketDetailHash,
  getMeegleSprintDetailHash,
  getWorkspaceNavigationRoutes,
  getWorkspaceRoute,
  INTEGRATIONS_ROUTE,
  INTEGRATIONS_SUBROUTES,
  WORKSPACE_NAVIGATION_ROUTES,
} from "./workspace-routes.js";

test("resolves each workspace hash to its page route", () => {
  assert.equal(getWorkspaceRoute("#meegle-workitems").page, "meegle-workitems");
  assert.equal(getWorkspaceRoute("#meegle-sprints").page, "meegle-sprints");
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

test("resolves a Meegle Sprint detail deep link with its parent breadcrumb", () => {
  const hash = getMeegleSprintDetailHash("Odoo Sprint / 20260827");
  assert.equal(hash, "#meegle-sprints/Odoo%20Sprint%20%2F%2020260827");
  const route = getWorkspaceRoute(hash);
  assert.deepEqual(route, {
    page: "meegle-sprint-detail",
    hash,
    title: "Odoo Sprint / 20260827",
    sprintName: "Odoo Sprint / 20260827",
  });
  assert.deepEqual(appendWorkspaceBreadcrumb([], route).map(({ hash: itemHash, label }) => [itemHash, label]), [
    ["#meegle-sprints", "Meegle Sprint"],
    [hash, "Odoo Sprint / 20260827"],
  ]);
});

test("keeps sync and shortcut help as Integrations subpages", () => {
  assert.deepEqual(INTEGRATIONS_SUBROUTES.map((route) => route.page), ["integrations", "sync", "shortcuts"]);
  assert.equal(WORKSPACE_NAVIGATION_ROUTES.some((route) => route.page === "sync"), false);
  assert.equal(WORKSPACE_NAVIGATION_ROUTES.some((route) => route.page === "shortcuts"), false);
});

test("limits workspace navigation to server-provided role permissions", () => {
  const developerAccess = { platformLists: true, platformSync: false };
  const devopsAccess = { platformLists: true, platformSync: true };
  const restrictedAccess = { platformLists: false, platformSync: false };

  assert.deepEqual(getWorkspaceNavigationRoutes(developerAccess).map((route) => route.page), ["lark-tickets", "meegle-workitems", "meegle-sprints", "github-pull-requests"]);
  assert.deepEqual(getIntegrationsSubroutes(developerAccess).map((route) => route.page), ["integrations", "shortcuts"]);
  assert.equal(canAccessWorkspaceRoute(devopsAccess, getWorkspaceRoute("#sync")), true);
  assert.equal(getDefaultSettingsRoute(devopsAccess).hash, "#sync");
  assert.equal(getDefaultSettingsRoute(developerAccess), INTEGRATIONS_ROUTE);
  assert.equal(canAccessWorkspaceRoute(restrictedAccess, getWorkspaceRoute("#lark-tickets")), false);
  assert.equal(canAccessWorkspaceRoute(restrictedAccess, getWorkspaceRoute("#integrations")), true);
});

test("keeps no more than five workspace breadcrumbs and truncates when returning", () => {
  const trail = ["#lark-tickets", "#meegle-workitems", "#meegle-sprints", "#github-pull-requests", "#integrations", "#sync", "#shortcuts"]
    .reduce((current, hash) => appendWorkspaceBreadcrumb(current, getWorkspaceRoute(hash)), []);

  assert.deepEqual(trail.map((item) => item.hash), ["#meegle-sprints", "#github-pull-requests", "#integrations", "#sync", "#shortcuts"]);
  assert.deepEqual(
    appendWorkspaceBreadcrumb(trail, getWorkspaceRoute("#github-pull-requests")).map((item) => item.hash),
    ["#meegle-sprints", "#github-pull-requests"],
  );
});
