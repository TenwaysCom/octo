import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceRoute, SETTINGS_ROUTE } from "./workspace-routes.js";

test("resolves each workspace hash to its page route", () => {
  assert.equal(getWorkspaceRoute("#meegle-workitems").page, "meegle-workitems");
  assert.equal(getWorkspaceRoute("#github-pull-requests").title, "GitHub PR");
});

test("uses the settings route for empty and unsupported hashes", () => {
  assert.equal(getWorkspaceRoute("").page, "settings");
  assert.equal(getWorkspaceRoute("#settings-integrations"), SETTINGS_ROUTE);
});
