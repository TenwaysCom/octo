import test from "node:test";
import assert from "node:assert/strict";
import { mountWeKnoraWidget } from "./weknora-widget.js";

test("mounts the specified widget and destroys it on leave", async () => {
  let options;
  let destroyed = 0;
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api/", load: async () => ({ init(value) { options = value; }, destroy() { destroyed++; } }) });
  await Promise.resolve();
  assert.deepEqual(options, { channel: "6410a037-6485-4408-8173-4b0c498a0426", tokenEndpoint: "/api/weknora/embed-token", baseUrl: "https://weknora.odoo.tenways.it:18443", position: "bottom-right", primaryColor: "#7d6955", title: "octo 客服" });
  dispose();
  assert.equal(destroyed, 1);
});
test("does not mount after leaving while SDK is loading (including StrictMode cleanup)", async () => {
  let finish;
  let mounted = 0;
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api", load: () => new Promise((resolve) => { finish = resolve; }) });
  dispose();
  finish({ init() { mounted++; } });
  await Promise.resolve();
  assert.equal(mounted, 0);
});
test("SDK failure leaves the page usable", async () => {
  const dispose = mountWeKnoraWidget({ apiBaseUrl: "/api", load: async () => { throw new Error("offline"); } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotThrow(dispose);
});
