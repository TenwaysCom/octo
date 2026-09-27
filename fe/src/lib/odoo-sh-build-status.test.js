import assert from "node:assert/strict";
import test from "node:test";
import { getSharedOdooShBuildState, indexOdooShBuilds, getOdooShBuildTone, resolveGitHubRepoEnvironment, resolveMeegleSystemEnvironment } from "./odoo-sh-build-status.js";

test("matches shared builds by environment and branch, preserving stale and unavailable states", () => {
  const shared = { status: "ready", environments: indexOdooShBuilds([
    { environment: "eu", state: "ready", stale: true, builds: [{ branch: "same-branch", status: "done", result: "failed" }] },
    { environment: "uk", state: "ready", stale: false, builds: [{ branch: "same-branch", status: "done", result: "success" }] },
    { environment: "us", state: "unavailable", stale: false, builds: [] },
  ]) };
  assert.deepEqual(getSharedOdooShBuildState(shared, { repo: "Tenways", headRef: "same-branch" }), { status: "stale", builds: [{ environment: "eu", status: "done", result: "failed" }] });
  assert.deepEqual(getSharedOdooShBuildState(shared, { repo: "Tenways-UKK", headRef: "same-branch" }), { status: "ready", builds: [{ environment: "uk", status: "done", result: "success" }] });
  assert.deepEqual(getSharedOdooShBuildState(shared, { repo: "Tenways", headRef: "missing" }), { status: "stale", builds: [] });
  for (const pullRequest of [{ repo: "odoo_tenways", headRef: "same-branch" }, { repo: "unmapped", headRef: "same-branch" }, { repo: "Tenways" }]) {
    assert.deepEqual(getSharedOdooShBuildState(shared, pullRequest), { status: "unavailable", builds: [] });
  }
  assert.deepEqual(getSharedOdooShBuildState({ status: "loading" }, { repo: "Tenways", headRef: "same-branch" }), { status: "loading", builds: [] });
});

test("maps Odoo.sh build results to the requested dot colours", () => {
  assert.equal(getOdooShBuildTone("failed"), "failed");
  assert.equal(getOdooShBuildTone("warning"), "warning");
  assert.equal(getOdooShBuildTone("SUCCESS"), "success");
  assert.equal(getOdooShBuildTone("progress"), "unknown");
});

test("resolves the Odoo.sh environment from the GitHub repo name", () => {
  assert.equal(resolveGitHubRepoEnvironment("Tenways"), "eu");
  assert.equal(resolveGitHubRepoEnvironment("tenways-ukk"), "uk");
  assert.equal(resolveGitHubRepoEnvironment("odoo_tenways"), "us");
  assert.equal(resolveGitHubRepoEnvironment("octo"), undefined);
  assert.equal(resolveGitHubRepoEnvironment(undefined), undefined);
});

test("resolves the Odoo.sh environment from the Meegle system field", () => {
  assert.equal(resolveMeegleSystemEnvironment("eu"), "eu");
  assert.equal(resolveMeegleSystemEnvironment("uk"), "uk");
  assert.equal(resolveMeegleSystemEnvironment("us"), "us");
  assert.equal(resolveMeegleSystemEnvironment("UK"), "uk");
  assert.equal(resolveMeegleSystemEnvironment("Odoo"), "eu");
  assert.equal(resolveMeegleSystemEnvironment("Odoo EU"), "eu");
  assert.equal(resolveMeegleSystemEnvironment("Odoo/Odoo UK"), "uk");
  assert.equal(resolveMeegleSystemEnvironment("Odoo US"), "us");
  assert.equal(resolveMeegleSystemEnvironment("Odoo EU/Odoo UK"), undefined);
  assert.equal(resolveMeegleSystemEnvironment(""), undefined);
});
