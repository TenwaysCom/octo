import test from "node:test";
import assert from "node:assert/strict";
import { isLarkClient, requestLarkLoginCode, performLarkH5Login, uploadLarkLoginDiagnostic } from "./lark-h5-login.js";

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

test("SDK rejection diagnostics preserve numeric codes and discard credentials and raw messages", async () => {
  const events = [];
  await assert.rejects(performLarkH5Login({ apiBaseUrl: "/api", actionRunId: "run-safe",
    onDiagnostic: (detail) => events.push(detail),
    fetchImpl: async () => Response.json({ ok: true, data: { appId: "private-app", challengeId: "private-challenge" } }),
    loadSdk: async () => ({ h5sdk, tt: { requestAccess: ({ fail }) => fail({
      errno: 2601002, errorCode: "333448", errCode: "private-code", code: "private-code",
      errString: "private-token", cookie: "private-cookie",
    }) } }),
  }), /H5_LOGIN_DENIED/);
  const failure = events.find((event) => event.callback === "requestAccess.fail");
  assert.equal(failure.sdk_errno, 2601002);
  assert.equal(failure.sdk_errorCode, 333448);
  assert.equal(failure.stage, "sdk.requestAccess");
  assert.ok(events.every((event) => event.actionRunId === "run-safe"));
  assert.equal(events.at(-1).errorCode, "H5_LOGIN_DENIED");
  assert.ok(!JSON.stringify(events).includes("private-"));
});

test("timeout diagnostics distinguish ready from authorization and ignore late failures", async () => {
  for (const ready of [false, true]) {
    const events = [];
    let lateFail;
    await assert.rejects(requestLarkLoginCode({ appId: "app", timeoutMs: 1,
      h5sdk: { ready: (callback) => { if (ready) callback(); } },
      tt: { requestAccess: ({ fail }) => { lateFail = fail; } },
      onDiagnostic: (stage, status, detail) => events.push({ stage, status, ...detail }),
    }), /H5_LOGIN_TIMEOUT/);
    assert.equal(events.at(-1).stage, ready ? "sdk.requestAccess" : "sdk.ready");
    assert.equal(events.at(-1).errorCode, "H5_LOGIN_TIMEOUT");
    const length = events.length;
    lateFail?.({ errno: 103 });
    assert.equal(events.length, length);
  }
});

test("inner SDK reasons are classified without uploading error text or URLs for either login API", async () => {
  for (const api of ["requestAccess", "requestAuthCode"]) {
    const events = [];
    await assert.rejects(requestLarkLoginCode({ h5sdk, appId: "private-app",
      tt: { [api]: ({ fail }) => fail({ errno: 2700002, errCode: 999,
        errString: "Authorization terminated unexpectedly. Error code: 20029; error message: invalid redirect uri in h5 case https://private.example/?code=private-code",
        errMsg: "requestAccess:fail please check errno", message: "Error code: 20029; private-token",
      }) },
      onDiagnostic: (stage, status, detail) => events.push({ stage, status, ...detail }),
    }), /H5_LOGIN_DENIED/);
    const failure = events.find((event) => event.status === "callback_failed");
    assert.equal(failure.callback, `${api}.fail`);
    assert.deepEqual(failure.sdk_innerErrorCodes, [20029]);
    assert.deepEqual(failure.sdk_reasonHints, ["INVALID_REDIRECT_URI", "AUTHORIZATION_TERMINATED"]);
    assert.ok(!JSON.stringify(events).includes("private"));
    assert.ok(!JSON.stringify(events).includes("errString"));
  }
});

test("inner diagnostics ignore unknown text, malformed codes and non-string values", async () => {
  for (const errString of ["Error code: 1234567890;", "Error code: 123secret;", "Error code: 12.5;",
    "unknown private-token", { message: "Error code: 20029;" }, "x".repeat(4096) + "Error code: 20029;"]) {
    let failure;
    await assert.rejects(requestLarkLoginCode({ h5sdk, appId: "app",
      tt: { requestAccess: ({ fail }) => fail({ errString, errMsg: null }) },
      onDiagnostic: (_stage, status, detail) => { if (status === "callback_failed") failure = detail; },
    }), /H5_LOGIN_DENIED/);
    assert.deepEqual(failure.sdk_innerErrorCodes, []);
    assert.deepEqual(failure.sdk_reasonHints, []);
  }
});

test("diagnostic upload uses the existing endpoint and tolerates transport failure", async () => {
  const detail = { actionRunId: "run-safe", stage: "sdk.load", status: "failed" };
  await uploadLarkLoginDiagnostic("/api", detail, async (url, options) => {
    assert.equal(url, "/api/debug/client-log");
    assert.deepEqual(JSON.parse(options.body), { source: "fe", level: "warn", event: "LARK_H5_LOGIN_DIAGNOSTIC", detail });
    throw new Error("network unavailable");
  });
});

test("broken diagnostic callbacks do not affect successful login", async () => {
  for (const onDiagnostic of [() => { throw new Error("logging failed"); }, async () => { throw new Error("upload failed"); }]) {
    const result = await performLarkH5Login({ apiBaseUrl: "/api", actionRunId: "run-safe", onDiagnostic,
      loadSdk: async () => ({ h5sdk, tt: { requestAccess: ({ success }) => success({ code: "private-code" }) } }),
      fetchImpl: async (url) => Response.json({ ok: true, data: url.endsWith("/start")
        ? { appId: "app", challengeId: "challenge" } : { user: { id: "user" } } }),
    });
    assert.equal(result.authenticated, true);
  }
});
