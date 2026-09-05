import assert from "node:assert/strict";
import test from "node:test";
import { listMeegleSprintAiSessions, streamMeegleSprintAiSession } from "./meegle-sprint-ai-api.js";

const sprint = { projectKey: "proj_1", sprintId: "sprint_1" };

test("lists Sprint-scoped AI Sessions with the browser session", async () => {
  let request;
  const sessions = await listMeegleSprintAiSessions({
    apiBaseUrl: "/api", sprint,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { sessions: [{ sessionId: "sess_1", title: "Release Notes", updatedAt: "2026-08-28T00:00:00.000Z" }] } }) };
    },
  });
  assert.deepEqual(sessions, [{ sessionId: "sess_1", title: "Release Notes", updatedAt: "2026-08-28T00:00:00.000Z" }]);
  assert.equal(request.url, "/api/web/meegle-sprints/sprint_1/ai-sessions?projectKey=proj_1");
  assert.equal(request.options.credentials, "include");
});

test("starts Sprint quick-action Session with Sprint scope and action run id", async () => {
  let request;
  await streamMeegleSprintAiSession({
    apiBaseUrl: "/api", sprint, message: "生成 Release Notes", actionKey: "meegle-sprint-release-notes", actionRunId: "run_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n")); controller.close(); } }) };
    },
  });
  assert.equal(request.url, "/api/web/meegle-sprints/sprint_1/ai-sessions");
  assert.deepEqual(JSON.parse(request.options.body), { projectKey: "proj_1", message: "生成 Release Notes", actionKey: "meegle-sprint-release-notes", actionRunId: "run_1" });
});
