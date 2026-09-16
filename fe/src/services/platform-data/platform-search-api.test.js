import assert from "node:assert/strict";
import test from "node:test";
import { getTicketFilterOptions, searchPlatformData } from "./platform-search-api.js";

test("sends search text literally, pagination, web credentials and cancellation", async () => {
  const controller = new AbortController();
  const data = { items: [{ kind: "github-pull-requests", title: "Checkout", number: "42", status: "merged", scope: "acme/app", sourceId: "42" }], hasMore: false };
  const result = await searchPlatformData({ apiBaseUrl: "/api", query: "  订单 %_#42  ", offset: 20, signal: controller.signal, fetchImpl: async (url, options) => {
    const parsed = new URL(url, "https://octo.test");
    assert.equal(parsed.pathname, "/api/web/platform-data/search");
    assert.equal(parsed.searchParams.get("q"), "订单 %_#42");
    assert.equal(parsed.searchParams.get("offset"), "20");
    assert.equal(parsed.searchParams.get("kind"), null);
    assert.ok(parsed.searchParams.get("actionRunId"));
    assert.equal(options.credentials, "include");
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => ({ ok: true, data }) };
  } });
  assert.deepEqual(result, data);
});

test("keeps the selected platform in requests for later result pages", async () => {
  await searchPlatformData({ apiBaseUrl: "/api", query: "checkout", kind: "meegle-workitems", offset: 40, fetchImpl: async (url) => {
    const params = new URL(url, "https://octo.test").searchParams;
    assert.equal(params.get("kind"), "meegle-workitems");
    assert.equal(params.get("offset"), "40");
    return { ok: true, json: async () => ({ ok: true, data: { items: [], hasMore: false } }) };
  } });
});

test("rejects unsuccessful and malformed search responses", async () => {
  for (const data of [{ items: [], hasMore: true, nextOffset: 0 }, { items: [{}], hasMore: false }, { items: [], hasMore: "yes" }]) {
    await assert.rejects(searchPlatformData({ apiBaseUrl: "/api", query: "x", fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data }) }) }), /INVALID_PLATFORM_SEARCH_RESPONSE/);
  }
  await assert.rejects(searchPlatformData({ apiBaseUrl: "/api", query: "x", fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: { errorCode: "WORKSPACE_ACCESS_DENIED" } }) }) }), /WORKSPACE_ACCESS_DENIED/);
});

test("loads complete requester, responsible and issue-type options independently of list pagination", async () => {
  const data = { requester: ["Ada"], responsible: ["Ann"], issueType: ["Bug"] };
  assert.deepEqual(await getTicketFilterOptions({ apiBaseUrl: "/api", fetchImpl: async (url) => {
    assert.equal(url, "/api/web/platform-data/lark-ticket-filter-options");
    return { ok: true, json: async () => ({ ok: true, data }) };
  } }), data);
});
