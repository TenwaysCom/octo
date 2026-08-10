import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformDataList } from "./platform-data-api.js";

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

function expectGitHubPullRequestWithBuild() {
  return {
    owner: "TenwaysCom",
    repo: "Tenways",
    pullNumber: 1138,
    title: "PR",
    state: "open",
    htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
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
