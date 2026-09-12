import assert from "node:assert/strict";
import test from "node:test";
import { loadLarkTicketPreparedMessages, loadLarkTicketSharedUrl } from "./lark-ticket-api.js";

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

test("loads prepared Ticket thread messages with the browser session", async () => {
  const requests = [];
  const prepared = await loadLarkTicketPreparedMessages({
    apiBaseUrl: "/api", ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, data: { messages: [{ messageId: "om_1", text: "hello" }] } }) };
    },
  });
  assert.equal(requests[0].url, "/api/web/lark-tickets/rec_1/prepared-messages?baseId=app_1&tableId=tbl_1");
  assert.equal(requests[0].options.credentials, "include");
  assert.deepEqual(prepared.messages, [{ messageId: "om_1", text: "hello" }]);
});
