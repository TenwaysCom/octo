import test from "node:test";
import assert from "node:assert/strict";
import { readLarkChatLaunch, getSignedChatContext, collectLarkChatContext } from "./lark-h5-context.js";

const href = 'https://octo.example/?from=chat_action&bdp_launch_query=%7B%22__trigger_id__%22%3A%22private-trigger%22%7D#lark-app-thread-analysis';
const config = { appId: "cli_test", timestamp: 1510045655000, nonceStr: "nonce", signature: "private-signature" };
const input = { apiBaseUrl: "/api", href, userAgent: "Lark/7.0", actionRunId: "run1" };

test("recognizes chat launch and never substitutes a trigger code for the chat ID", () => {
  assert.equal(readLarkChatLaunch(href).triggerCode, "private-trigger");
  assert.equal(readLarkChatLaunch("https://octo.example/?from=message_action").errorCode, "MESSAGE_ACTION_UNSUPPORTED");
  assert.equal(readLarkChatLaunch("https://octo.example/").errorCode, "CHAT_ENTRY_REQUIRED");
  assert.equal(readLarkChatLaunch("https://octo.example/?from=chat_action&bdp_launch_query=%7B").errorCode, "INVALID_LAUNCH_QUERY");
});

test("requires BOTH config success and ready, regardless of callback order", async () => {
  for (const readyFirst of [true, false]) {
    let onReady, onSuccess, calls = 0;
    const promise = getSignedChatContext({ config, triggerCode: "private-trigger",
      h5sdk: { error() {}, ready(cb) { onReady = cb; }, config(options) { onSuccess = options.onSuccess; assert.deepEqual(options.jsApiList, ["getTriggerContext"]); } },
      tt: { getTriggerContext({ triggerCode, success }) { calls++; assert.equal(triggerCode, "private-trigger"); success({ openChatId: "oc_test123", session_key: "private-session" }); } },
    });
    (readyFirst ? onReady : onSuccess)();
    assert.equal(calls, 0);
    (readyFirst ? onSuccess : onReady)();
    assert.equal(await promise, "oc_test123");
    onSuccess(); onReady();
    assert.equal(calls, 1);
  }
});

test("config failure cannot call chat API even after a late ready", async () => {
  let calls = 0, ready;
  const promise = getSignedChatContext({ config, triggerCode: "x", h5sdk: {
    error() {}, ready(cb) { ready = cb; }, config({ onFail }) { onFail({ errMsg: "private" }); },
  }, tt: { getTriggerContext() { calls++; } } });
  await assert.rejects(promise, /H5_CONFIG_FAILED/);
  ready();
  assert.equal(calls, 0);
});

test("config timeout ignores late callbacks", async () => {
  let success, calls = 0;
  const promise = getSignedChatContext({ config, triggerCode: "x", timeoutMs: 1,
    h5sdk: { error() {}, ready(cb) { cb(); }, config(options) { success = options.onSuccess; } },
    tt: { getTriggerContext() { calls++; } },
  });
  await assert.rejects(promise, /H5_CONFIG_TIMEOUT/);
  success();
  assert.equal(calls, 0);
});

test("signs the unmodified query and logs only the chat ID and safe diagnostic fields", async () => {
  const requests = [];
  const result = await collectLarkChatContext({ ...input,
    loadSdk: async () => ({ h5sdk: { error() {}, ready(cb) { cb(); }, config({ onSuccess }) { onSuccess({ session_key: "private-session" }); } },
      tt: { getTriggerContext({ success }) { success({ openChatId: "oc_test123", messages: ["private-message"] }); } },
    }),
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return Response.json(url.endsWith("/signature") ? { ok: true, data: config } : { ok: true });
    },
  });
  assert.equal(requests[0].body.url, href.split("#")[0]);
  assert.equal(result.openChatId, "oc_test123");
  assert.equal(result.logged, true);
  assert.equal(requests[1].body.event, "LARK_APP_OPEN_CHAT_CONTEXT");
  assert.doesNotMatch(JSON.stringify(requests[1]), /private-|bdp_launch_query|signature|messages/);
});

test("normal browser, missing launch and signing failure do not prevent search or expose errors", async () => {
  for (const options of [{ userAgent: "Chrome/120" }, { href: "https://octo.example/" }, {}]) {
    let configCalled = false;
    const result = await collectLarkChatContext({ ...input, ...options,
      loadSdk: async () => ({ h5sdk: { config() { configCalled = true; } } }),
      fetchImpl: async (url) => {
        if (url.endsWith("/signature")) return Response.json({ ok: false, error: "private-ticket" }, { status: 503 });
        throw new Error("private-network-error");
      },
    });
    assert.equal(configCalled, false);
    assert.equal(result.openChatId, null);
    assert.equal(result.logged, false);
    assert.doesNotMatch(JSON.stringify(result), /private-/);
  }
});
