import assert from "node:assert/strict";
import test from "node:test";
import { getOdooShBuildTone, resolveGitHubRepoEnvironment, resolveMeegleSystemEnvironment } from "./odoo-sh-build-status.js";

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
