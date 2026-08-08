import assert from "node:assert/strict";
import test from "node:test";
import { buildApiUrl, getFrontendConfig } from "./runtime-config.js";

test("loads FE-owned API configuration", () => {
  assert.deepEqual(getFrontendConfig({
    VITE_API_BASE_URL: "http://localhost:3040/",
  }), {
    apiBaseUrl: "http://localhost:3040",
  });
});

test("requires an FE API base URL", () => {
  assert.throws(() => getFrontendConfig({}), /VITE_API_BASE_URL/);
});

test("builds an API URL without duplicate separators", () => {
  assert.equal(buildApiUrl("/api/", "/identity/resolve"), "/api/identity/resolve");
});
