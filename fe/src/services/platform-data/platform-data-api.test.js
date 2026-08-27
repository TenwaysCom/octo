import assert from "node:assert/strict";
import test from "node:test";
import {
  getGitHubPullRequestPreview,
  getPlatformDataList,
  getPlatformDataListPage,
  resetAllOdooDevopsBranchesCache,
} from "./platform-data-api.js";
import { getPlatformSyncSources, syncPlatformSource } from "./platform-sync-api.js";

test("loads a synced platform list with the browser session cookie", async () => {
  let request;
  const result = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "meegle-workitems",
    filters: { sprint: ["Sprint 1"] },
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
        priority: "P1",
        itemCycleTag: "sprint-1",
        addToCycleTime: "2026-08-06T01:00:00.000Z",
        itemStartTime: "2026-08-07T01:00:00.000Z",
        itemFinishTime: "2026-08-08T01:00:00.000Z",
        githubPullRequests: [{ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1, title: "PR", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1", headRef: "feature/m-1", baseRef: "main", state: "merged", odooShBuilds: [{ environment: "eu", status: "done", result: "success" }] }],
      }], sprints: ["Sprint 1"], sprintDetails: [{
        projectKey: "4c3fv6",
        sprintId: "sprint-1",
        name: "Sprint 1",
        status: "In progress",
        description: "Sprint 说明",
        startAt: "2026-08-06T00:00:00.000Z",
        endAt: "2026-08-20T00:00:00.000Z",
        syncedAt: "2026-08-09T00:00:00.000Z",
      }] } }) };
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
      priority: "P1",
      itemCycleTag: "sprint-1",
      addToCycleTime: "2026-08-06T01:00:00.000Z",
      itemStartTime: "2026-08-07T01:00:00.000Z",
      itemFinishTime: "2026-08-08T01:00:00.000Z",
      githubPullRequests: [{ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1, title: "PR", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1", headRef: "feature/m-1", baseRef: "main", state: "merged", odooShBuilds: [{ environment: "eu", status: "done", result: "success" }] }],
    }],
    sprints: ["Sprint 1"],
    sprintDetails: [{
      projectKey: "4c3fv6",
      sprintId: "sprint-1",
      name: "Sprint 1",
      status: "In progress",
      description: "Sprint 说明",
      startAt: "2026-08-06T00:00:00.000Z",
      endAt: "2026-08-20T00:00:00.000Z",
      syncedAt: "2026-08-09T00:00:00.000Z",
    }],
    pager: { offset: 0, limit: 500, total: 1, hasMore: false },
  });
  assert.equal(request.url, "/api/web/platform-data/meegle-workitems?limit=500&sprint=Sprint+1");
  assert.equal(request.options.credentials, "include");
});

test("requests 500 rows for the Lark ticket list", async () => {
  let requestUrl;
  await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "lark-tickets",
    fetchImpl: async (url) => {
      requestUrl = url;
      return { ok: true, json: async () => ({ ok: true, data: { items: [] } }) };
    },
  });
  assert.equal(requestUrl, "/api/web/platform-data/lark-tickets?limit=500");
});

test("shares an in-flight list request across duplicate mounts", async () => {
  let requestCount = 0;
  let releaseResponse;
  const responseReady = new Promise((resolve) => { releaseResponse = resolve; });
  const fetchImpl = async () => {
    requestCount += 1;
    await responseReady;
    return { ok: true, json: async () => ({ ok: true, data: { items: [] } }) };
  };

  const first = getPlatformDataList({ apiBaseUrl: "/dedup-api", kind: "lark-tickets", fetchImpl });
  const second = getPlatformDataList({ apiBaseUrl: "/dedup-api", kind: "lark-tickets", fetchImpl });
  assert.strictEqual(first, second);
  assert.equal(requestCount, 1);

  releaseResponse();
  await assert.doesNotReject(first);
});

test("requests every matching page while preserving multi-value server filters", async () => {
  const requests = [];
  const firstPage = Array.from({ length: 500 }, (_, index) => ({ recordId: `rec-${index}` }));
  const result = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "lark-tickets",
    filters: {
      status: ["Open", "In progress"],
      issueType: ["Feature"],
      priority: ["P0"],
      quickFilter: "unsynced",
    },
    fetchImpl: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({ ok: true, data: { items: requests.length === 1 ? firstPage : [{ recordId: "rec-500" }], ...(requests.length === 1 ? { pager: { offset: 0, limit: 500, total: 501, hasMore: true, nextOffset: 500 } } : { pager: { offset: 500, limit: 500, total: 501, hasMore: false } }) } }),
      };
    },
  });

  assert.equal(result.items.length, 501);
  assert.equal(requests[0], "/api/web/platform-data/lark-tickets?limit=500&status=Open&status=In+progress&issueType=Feature&priority=P0&quickFilter=unsynced");
  assert.equal(requests[1], "/api/web/platform-data/lark-tickets?limit=500&offset=500&status=Open&status=In+progress&issueType=Feature&priority=P0&quickFilter=unsynced");
});

test("loads one page only until the list view requests the next offset", async () => {
  const requests = [];
  const firstPage = Array.from({ length: 500 }, (_, index) => ({ recordId: `rec-${index}` }));
  const result = await getPlatformDataListPage({
    apiBaseUrl: "/api",
    kind: "lark-tickets",
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ ok: true, data: { items: firstPage, pager: { offset: 0, limit: 500, total: 501, hasMore: true, nextOffset: 500 } } }) };
    },
  });

  assert.equal(result.items.length, 500);
  assert.deepEqual(result.pager, { offset: 0, limit: 500, total: 501, hasMore: true, nextOffset: 500 });
  assert.deepEqual(requests, ["/api/web/platform-data/lark-tickets?limit=500"]);
});

test("treats an old server response without pager as one complete page", async () => {
  const requests = [];
  const result = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "lark-tickets",
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ ok: true, data: { items: Array.from({ length: 500 }, (_, index) => ({ recordId: `rec-${index}` })) } }) };
    },
  });

  assert.equal(result.items.length, 500);
  assert.equal(requests.length, 1);
});

test("rejects unknown list kinds before making a request", async () => {
  await assert.rejects(
    () => getPlatformDataList({ apiBaseUrl: "/api", kind: "unknown", fetchImpl: async () => undefined }),
    { message: "UNKNOWN_PLATFORM_DATA_KIND" },
  );
});

test("loads up to 500 GitHub PR rows with Odoo.sh build data", async () => {
  const result = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "github-pull-requests",
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => {
        assert.equal(url, "/api/web/platform-data/github-pull-requests?limit=500");
        return { ok: true, data: { items: [{
          owner: "TenwaysCom",
          repo: "Tenways",
          pullNumber: 1138,
          title: "PR",
          description: "PR description",
          state: "open",
          htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
          authorLogin: "octo",
          mergedBy: "maintainer",
          reviewers: ["reviewer"],
          labels: ["bug"],
          headRef: "feature/m-1138",
          baseRef: "main",
          isDraft: false,
          meegleIds: ["13802503"],
          meegleWorkitems: [{
            projectKey: "project",
            projectName: "Tenways",
            workItemTypeKey: "story",
            workItemId: "13802503",
            workItemKey: "M-13802503",
            title: "Linked story",
            workItemType: "Feature",
            status: "Doing",
            sprint: "Sprint 1",
            version: "Version 1",
          }],
          syncedAt: "2026-08-10T00:00:00.000Z",
          odooShBuilds: [{ environment: "eu", status: "done", result: "warning" }],
        }] } };
      },
    }),
  });

  assert.deepEqual(result.items, [expectGitHubPullRequestWithBuild()]);
});

test("accepts a GitHub PR response from before linked Meegle fields were added", async () => {
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
        isDraft: false,
        syncedAt: "2026-08-10T00:00:00.000Z",
        odooShBuilds: [],
      }] } }),
    }),
  });

  assert.deepEqual(result.items[0].meegleIds, []);
  assert.deepEqual(result.items[0].meegleWorkitems, []);
});

test("loads a GitHub PR preview with linked Meegle details on demand", async () => {
  let request;
  const result = await getGitHubPullRequestPreview({
    apiBaseUrl: "/api",
    owner: "TenwaysCom",
    repo: "Tenways Web",
    pullNumber: 1138,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: expectGitHubPullRequestWithBuild() }) };
    },
  });

  assert.deepEqual(result, expectGitHubPullRequestWithBuild());
  assert.equal(request.url, "/api/web/platform-data/github-pull-request-preview?owner=TenwaysCom&repo=Tenways+Web&pullNumber=1138");
  assert.equal(request.options.credentials, "include");
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
    description: "PR description",
    state: "open",
    htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
    authorLogin: "octo",
    mergedBy: "maintainer",
    reviewers: ["reviewer"],
    labels: ["bug"],
    headRef: "feature/m-1138",
    baseRef: "main",
    isDraft: false,
    meegleIds: ["13802503"],
    meegleWorkitems: [{
      projectKey: "project",
      projectName: "Tenways",
      workItemTypeKey: "story",
      workItemId: "13802503",
      workItemKey: "M-13802503",
      title: "Linked story",
      workItemType: "Feature",
      status: "Doing",
      sprint: "Sprint 1",
      version: "Version 1",
    }],
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
