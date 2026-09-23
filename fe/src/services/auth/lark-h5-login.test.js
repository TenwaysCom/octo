import test from "node:test";
import assert from "node:assert/strict";
import { isLarkClient, requestLarkLoginCode, performLarkH5Login } from "./lark-h5-login.js";

const h5sdk = { ready: (callback) => callback() };

test("detects native Lark and Feishu clients, not ordinary browsers", () => {
  assert.equal(isLarkClient("Mozilla/5.0 Lark/7.0.0"), true);
  assert.equal(isLarkClient("Mozilla/5.0 Feishu/7.0.0"), true);
  assert.equal(isLarkClient("Mozilla/5.0 Chrome/120.0 Safari/537"), false);
});

test("requests only login identity without calling config or chat APIs", async () => {
  const calls = [];
  const code = await requestLarkLoginCode({ h5sdk, appId: "cli_test", tt: { requestAccess: (input) => {
    calls.push(input);
    input.success({ code: "one-time-code" });
  } } });
  assert.equal(code, "one-time-code");
  assert.equal(calls[0].appID, "cli_test");
  assert.deepEqual(calls[0].scopeList, []);
});

test("uses legacy code API only when modern API is absent or unsupported", async () => {
  for (const requestAccess of [undefined, ({ fail }) => fail({ errno: 103 })]) {
    const code = await requestLarkLoginCode({ h5sdk, appId: "cli_test", tt: {
      requestAccess,
      requestAuthCode: ({ appId, success }) => { assert.equal(appId, "cli_test"); success({ code: "legacy-code" }); },
    } });
    assert.equal(code, "legacy-code");
  }
  let fallbackCalled = false;
  await assert.rejects(requestLarkLoginCode({ h5sdk, appId: "cli_test", tt: {
    requestAccess: ({ fail }) => fail({ errno: 999, errString: "private-code" }),
    requestAuthCode: () => { fallbackCalled = true; },
  } }), /H5_LOGIN_DENIED/);
  assert.equal(fallbackCalled, false);
});

test("ready and authorization timeouts settle and ignore late callbacks", async () => {
  let lateReady;
  let calls = 0;
  await assert.rejects(requestLarkLoginCode({ h5sdk: { ready: (cb) => { lateReady = cb; } }, appId: "cli_test", tt: { requestAccess: () => { calls++; } }, timeoutMs: 1 }), /H5_LOGIN_TIMEOUT/);
  lateReady();
  assert.equal(calls, 0);
  await assert.rejects(requestLarkLoginCode({ h5sdk, tt: { requestAccess: () => {} }, appId: "cli_test", timeoutMs: 1 }), /H5_LOGIN_TIMEOUT/);
});

test("exchanges code by POST, then reads identity only from authenticated profile", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/start")) return Response.json({ ok: true, data: { appId: "cli_test", challengeId: "challenge" } });
    if (url.endsWith("/complete")) return Response.json({ ok: true, data: { loggedIn: true } });
    return Response.json({ ok: true, data: { user: { id: "octo-user", larkOpenId: "ou_current" } } });
  };
  const result = await performLarkH5Login({ apiBaseUrl: "/api", actionRunId: "run-1", fetchImpl,
    loadSdk: async () => ({ h5sdk, tt: { requestAccess: ({ success }) => success({ code: "private-code", openId: "untrusted" }) } }),
  });
  assert.equal(result.profile.user.id, "octo-user");
  assert.equal(result.profile.user.larkOpenId, "ou_current");
  assert.deepEqual(requests.map(({ url }) => url), ["/api/lark/auth/h5/start", "/api/lark/auth/h5/complete", "/api/web/profile"]);
  assert.equal(requests[1].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[1].options.body), { actionRunId: "run-1", challengeId: "challenge", code: "private-code" });
  assert.ok(requests.every(({ options }) => options.credentials === "include"));
});

test("failed completion never reads profile or reports logged in", async () => {
  let calls = 0;
  await assert.rejects(performLarkH5Login({ apiBaseUrl: "/api", actionRunId: "run-1",
    loadSdk: async () => ({ h5sdk, tt: { requestAccess: ({ success }) => success({ code: "code" }) } }),
    fetchImpl: async () => ++calls === 1
      ? Response.json({ ok: true, data: { appId: "cli_test", challengeId: "challenge" } })
      : Response.json({ ok: false, error: { errorMessage: "private" } }, { status: 401 }),
  }), /H5_LOGIN_FAILED/);
  assert.equal(calls, 2);
});
