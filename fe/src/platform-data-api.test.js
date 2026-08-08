import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformDataList } from "./platform-data-api.js";

test("loads a synced platform list with the browser session cookie", async () => {
  let request;
  const items = await getPlatformDataList({
    apiBaseUrl: "/api",
    kind: "meegle-workitems",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { items: [{ workItemId: "1" }] } }) };
    },
  });

  assert.deepEqual(items, [{ workItemId: "1" }]);
  assert.equal(request.url, "/api/web/platform-data/meegle-workitems");
  assert.equal(request.options.credentials, "include");
});

test("rejects unknown list kinds before making a request", async () => {
  await assert.rejects(
    () => getPlatformDataList({ apiBaseUrl: "/api", kind: "unknown", fetchImpl: async () => undefined }),
    { message: "UNKNOWN_PLATFORM_DATA_KIND" },
  );
});
