import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformDataList, resetAllOdooDevopsBranchesCache } from "./platform-data-api.js";
import { getPlatformSyncSources, syncPlatformSource } from "./platform-sync-api.js";

test("loads a synced platform list with the browser session cookie", async () => {
  let request;
  const result = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "meegle-workitems",
    sprint: "Sprint 1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { items: [{
        projectKey: "4c3fv6",
        workItemTypeKey: "story",
        workItemId: "1",
        title: "Story",
        syncedAt: "2026-08-09T00:00:00.000Z",
        sprint: "Sprint 1",
        version: "Version 1",
        system: "Odoo EU",
        bugs: ["Bug 1"],
        githubPullRequests: [{ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1, title: "PR", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1", headRef: "feature/m-1", baseRef: "main", state: "merged", odooShBuilds: [{ environment: "eu", status: "done", result: "success" }] }],
      }], sprints: ["Sprint 1"] } }) };
    },
  });

  assert.deepEqual(result, {
    items: [{
      projectKey: "4c3fv6",
      workItemTypeKey: "story",
      workItemId: "1",
      title: "Story",
      syncedAt: "2026-08-09T00:00:00.000Z",
      sprint: "Sprint 1",
      version: "Version 1",
      system: "Odoo EU",
      bugs: ["Bug 1"],
      githubPullRequests: [{ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1, title: "PR", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1", headRef: "feature/m-1", baseRef: "main", state: "merged", odooShBuilds: [{ environment: "eu", status: "done", result: "success" }] }],
    }],
    sprints: ["Sprint 1"],
  });
  assert.equal(request.url, "/api/web/platform-data/meegle-workitems?sprint=Sprint+1");
  assert.equal(request.options.credentials, "include");
});

test("rejects unknown list kinds before making a request", async () => {
  await assert.rejects(
    () => getPlatformDataList({ apiBaseUrl: "/api", kind: "unknown", fetchImpl: async () => undefined }),
    { message: "UNKNOWN_PLATFORM_DATA_KIND" },
  );
});

test("loads Odoo.sh build data for GitHub PR rows", async () => {
  const result = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "github-pull-requests",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { items: [{
        owner: "TenwaysCom",
        repo: "Tenways",
        pullNumber: 1138,
        title: "PR",
        state: "open",
        htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
        authorLogin: "octo",
        mergedBy: "maintainer",
        reviewers: ["reviewer"],
        labels: ["bug"],
        headRef: "feature/m-1138",
        baseRef: "main",
        isDraft: false,
        syncedAt: "2026-08-10T00:00:00.000Z",
        odooShBuilds: [{ environment: "eu", status: "done", result: "warning" }],
      }] } }),
    }),
  });

  assert.deepEqual(result.items, [expectGitHubPullRequestWithBuild()]);
});

test("resets all Odoo DevOps branch caches with the web session", async () => {
  let request;
  const result = await resetAllOdooDevopsBranchesCache({
    apiBaseUrl: "/api",
    actionRunId: "reset_1138",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { environments: ["eu", "uk", "us"], actionRunId: "reset_1138" } }) };
    },
  });

  assert.deepEqual(result, { environments: ["eu", "uk", "us"], actionRunId: "reset_1138" });
  assert.equal(request.url, "/api/web/odoo-devops-branches/reset-cache");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.credentials, "include");
  assert.deepEqual(JSON.parse(request.options.body), { actionRunId: "reset_1138" });
});

test("loads and triggers a configured platform sync source with the web session", async () => {
  const sources = await getPlatformSyncSources({
    apiBaseUrl: "/api",
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/web/platform-sync-sources");
      assert.equal(options.credentials, "include");
      return { ok: true, json: async () => ({ ok: true, data: { sources: [{ id: "lark-tickets", label: "Lark Ticket", configured: true }] } }) };
    },
  });
  assert.deepEqual(sources, [{ id: "lark-tickets", label: "Lark Ticket", configured: true }]);

  let request;
  await syncPlatformSource({
    apiBaseUrl: "/api",
    sourceId: "lark-tickets",
    actionRunId: "sync_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { sourceId: "lark-tickets", synced: 1 } }) };
    },
  });
  assert.equal(request.url, "/api/web/platform-sync-sources/lark-tickets");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), { actionRunId: "sync_1" });
});

function expectGitHubPullRequestWithBuild() {
  return {
    owner: "TenwaysCom",
    repo: "Tenways",
    pullNumber: 1138,
    title: "PR",
    state: "open",
    htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
    authorLogin: "octo",
    mergedBy: "maintainer",
    reviewers: ["reviewer"],
    labels: ["bug"],
    headRef: "feature/m-1138",
    baseRef: "main",
    isDraft: false,
    syncedAt: "2026-08-10T00:00:00.000Z",
    odooShBuilds: [{ environment: "eu", status: "done", result: "warning" }],
  };
}

test("rejects an invalid Meegle four-field response", async () => {
  await assert.rejects(
    () => getPlatformDataList({
      apiBaseUrl: "/api",
      kind: "meegle-workitems",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { items: [{
          projectKey: "4c3fv6",
          workItemTypeKey: "story",
          workItemId: "1",
          title: "Story",
          syncedAt: "2026-08-09T00:00:00.000Z",
          bugs: "Bug 1",
        }], sprints: [] } }),
      }),
    }),
    { message: "INVALID_MEEGLE_WORKITEM_RESPONSE" },
  );
});
