import assert from "node:assert/strict";
import test from "node:test";
import { replyAcpPermission } from "./acp-permission-api.js";

test("sends only the selected option and request identities with the browser login", async () => {
  let captured;
  await replyAcpPermission({ apiBaseUrl: "http://localhost:3040/api", sessionId: "public", actionRunId: "run", requestId: "request", optionId: "once", command: "replacement", operatorLarkId: "forged", fetchImpl: async (...args) => {
    captured = args;
    return { ok: true, json: async () => ({ ok: true, data: {} }) };
  } });
  assert.equal(captured[0], "http://localhost:3040/api/web/acp/permissions/reply");
  assert.equal(captured[1].credentials, "include");
  assert.deepEqual(JSON.parse(captured[1].body), { sessionId: "public", actionRunId: "run", requestId: "request", optionId: "once" });
});

test("preserves expiry and ownership errors", async () => {
  await assert.rejects(replyAcpPermission({ apiBaseUrl: "/api", fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: { errorCode: "ACP_PERMISSION_EXPIRED", errorMessage: "Expired" } }) }) }), { code: "ACP_PERMISSION_EXPIRED" });
});
