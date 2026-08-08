import assert from "node:assert/strict";
import test from "node:test";
import { completeOctoPluginLogin, getExtensionDownloadInfo, getWebAuthSession, getWebProfile, logoutWebAuthSession, startLarkLogin, startOctoPluginLogin } from "./lark-auth-api.js";

test("loads the server-owned web session with browser credentials", async () => {
  let request;
  const session = await getWebAuthSession({
    apiBaseUrl: "https://api.example.test/",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { user: { larkName: "Lin" } } }) };
    },
  });

  assert.deepEqual(session, { authenticated: true, user: { larkName: "Lin" } });
  assert.equal(request.url, "https://api.example.test/lark/auth/web/ensure");
  assert.equal(request.options.credentials, "include");
});

test("loads the authenticated profile without exposing credentials", async () => {
  let request;
  const result = await getWebProfile({
    apiBaseUrl: "/api",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            user: { larkName: "Lin" },
            larkAuthorization: { status: "ready", authorizedAt: "2026-08-08T00:00:00.000Z" },
          },
        }),
      };
    },
  });

  assert.deepEqual(result, {
    authenticated: true,
    profile: {
      user: { larkName: "Lin" },
      larkAuthorization: { status: "ready", authorizedAt: "2026-08-08T00:00:00.000Z" },
    },
  });
  assert.equal(request.url, "/api/web/profile");
  assert.equal(request.options.credentials, "include");
});

test("loads the configured extension download URL", async () => {
  const result = await getExtensionDownloadInfo({
    apiBaseUrl: "/api",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { downloadUrl: "https://cdn.example.test/octo.zip" } }),
    }),
  });

  assert.deepEqual(result, { downloadUrl: "https://cdn.example.test/octo.zip" });
});

test("starts and ends Lark login through the configured server", async () => {
  const locationRef = { assigned: undefined, assign(url) { this.assigned = url; } };
  startLarkLogin({ apiBaseUrl: "/api", locationRef });
  assert.equal(locationRef.assigned, "/api/lark/auth/web/start");

  let request;
  await logoutWebAuthSession({
    apiBaseUrl: "/api",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    },
  });
  assert.equal(request.url, "/api/lark/auth/web/logout");
  assert.equal(request.options.credentials, "include");
});

test("creates and completes plugin login with browser credentials only", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => url.endsWith("/start")
        ? { ok: true, data: { challengeId: "challenge_123", expiresAt: "2026-08-08T00:05:00.000Z" } }
        : { ok: true, data: { loggedIn: true } },
    };
  };

  await assert.doesNotReject(async () => {
    const challenge = await startOctoPluginLogin({ apiBaseUrl: "/api", fetchImpl });
    assert.equal(challenge.challengeId, "challenge_123");
    assert.equal(await completeOctoPluginLogin({ apiBaseUrl: "/api", challengeId: challenge.challengeId, fetchImpl }), true);
  });
  assert.equal(requests[0].url, "/api/web/plugin-login/start");
  assert.equal(requests[0].options.credentials, "include");
  assert.equal(requests[1].url, "/api/web/plugin-login/complete");
  assert.equal(JSON.parse(requests[1].options.body).challengeId, "challenge_123");
  assert.equal(requests[1].options.credentials, "include");
});
