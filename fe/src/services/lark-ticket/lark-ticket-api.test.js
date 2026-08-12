import assert from "node:assert/strict";
import test from "node:test";
import { loadLarkTicketSharedUrl } from "./lark-ticket-api.js";

test("loads a missing Ticket shared URL through the browser session", async () => {
  let request;
  const sharedUrl = await loadLarkTicketSharedUrl({
    apiBaseUrl: "/api",
    ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1" } }) };
    },
  });

  assert.equal(sharedUrl, "https://example.larksuite.com/base/app_1?record=rec_1");
  assert.equal(request.url, "/api/web/lark-tickets/rec_1/shared-url?baseId=app_1&tableId=tbl_1");
  assert.equal(request.options.credentials, "include");
});
