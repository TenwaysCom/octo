import test from "node:test";
import assert from "node:assert/strict";
import { mountWeKnoraWidget as mountWidget } from "./weknora-widget.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
const available = async () => ({ ok: true, json: async () => ({ token: "test-token", expiresIn: 60 }) });
const mountWeKnoraWidget = (options) => mountWidget({ fetch: available, ...options });

test("mounts the specified widget and destroys it on leave", async () => {
  let options;
  let destroyed = 0;
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api/", load: async () => ({ init(value) { options = value; }, destroy() { destroyed++; } }) });
  await flush();
  assert.deepEqual(options, { channel: "6410a037-6485-4408-8173-4b0c498a0426", tokenEndpoint: "/api/weknora/embed-token", baseUrl: "https://weknora.odoo.tenways.it:18443", position: "bottom-right", primaryColor: "#7d6955", title: "octo 客服" });
  dispose();
  assert.equal(destroyed, 1);
});
test("does not mount after leaving while SDK is loading (including StrictMode cleanup)", async () => {
  let finish;
  let mounted = 0;
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api", load: () => new Promise((resolve) => { finish = resolve; }) });
  await flush();
  dispose();
  finish({ init() { mounted++; } });
  await flush();
  assert.equal(mounted, 0);
});
test("SDK failure leaves the page usable", async () => {
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api", load: async () => { throw new Error("offline"); } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotThrow(dispose);
});

for (const [name, fetch] of [
  ["network failure", async () => { throw new Error("offline"); }],
  ["upstream rejection", async () => ({ ok: false })],
  ["invalid token response", async () => ({ ok: true, json: async () => ({}) })],
]) {
  test(`${name} hides the icon even with a cached SDK`, async () => {
    let mounted = 0;
    const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api", fetch, load: async () => ({ init() { mounted++; } }) });
    await flush();
    assert.equal(mounted, 0);
    dispose();
  });
}

test("waits for the server before showing the icon and aborts the check on leave", async () => {
  let finish;
  let signal;
  let mounted = 0;
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api/", fetch: (url, options) => {
    assert.equal(url, "/api/weknora/embed-token");
    assert.equal(options.credentials, "include");
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  }, load: async () => ({ init() { mounted++; } }) });
  await flush();
  assert.equal(mounted, 0);
  dispose();
  assert.equal(signal.aborted, true);
  finish(await available());
  await flush();
  assert.equal(mounted, 0);
});

for (const pending of ["server", "SDK"]) {
  test(`${pending} timeout keeps the icon hidden even after a late response`, async () => {
    let finish;
    let signal;
    let mounted = 0;
    const sdk = { init() { mounted++; } };
    const deferred = new Promise((resolve) => { finish = resolve; });
    const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api", timeoutMs: 10,
      fetch: (_url, options) => { signal = options.signal; return pending === "server" ? deferred : available(); },
      load: () => pending === "SDK" ? deferred : Promise.resolve(sdk),
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(signal.aborted, true);
    assert.equal(mounted, 0);
    finish(pending === "server" ? await available() : sdk);
    await flush();
    assert.equal(mounted, 0);
    dispose();
  });
}
