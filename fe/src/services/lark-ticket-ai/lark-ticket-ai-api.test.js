import assert from "node:assert/strict";
import test from "node:test";
import { listLarkTicketAiSessions, loadLarkTicketAiSession, streamLarkTicketAiSession } from "./lark-ticket-ai-api.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };

test("lists Ticket-scoped AI Sessions with the browser session", async () => {
  let request;
  const sessions = await listLarkTicketAiSessions({
    apiBaseUrl: "/api",
    ticket,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { sessions: [{ sessionId: "sess_1", title: "Create PRD", updatedAt: "2026-08-12T00:00:00.000Z" }] } }) };
    },
  });
  assert.deepEqual(sessions, [{ sessionId: "sess_1", title: "Create PRD", updatedAt: "2026-08-12T00:00:00.000Z" }]);
  assert.equal(request.url, "/api/web/lark-tickets/rec_1/ai-sessions?baseId=app_1&tableId=tbl_1");
  assert.equal(request.options.credentials, "include");
});

test("loads an AI Session detail without exposing identity fields", async () => {
  let request;
  const session = await loadLarkTicketAiSession({
    apiBaseUrl: "/api",
    ticket,
    sessionId: "sess_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { sessionId: "sess_1", events: [] } }) };
    },
  });
  assert.deepEqual(session, { sessionId: "sess_1", events: [] });
  assert.equal(request.url, "/api/web/lark-tickets/rec_1/ai-sessions/sess_1/load");
  assert.deepEqual(JSON.parse(request.options.body), { baseId: "app_1", tableId: "tbl_1" });
});

test("starts a configured Ticket quick-action Session with its action key", async () => {
  let request;
  await streamLarkTicketAiSession({
    apiBaseUrl: "/api",
    ticket,
    message: "问题总结",
    actionKey: "lark-ticket-support-qa-summarize",
    actionRunId: "run_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("event: done\\ndata: {}\\n\\n"));
            controller.close();
          },
        }),
      };
    },
  });

  assert.equal(request.url, "/api/web/lark-tickets/rec_1/ai-sessions");
  assert.deepEqual(JSON.parse(request.options.body), {
    baseId: "app_1",
    tableId: "tbl_1",
    message: "问题总结",
    actionKey: "lark-ticket-support-qa-summarize",
    actionRunId: "run_1",
  });
});
