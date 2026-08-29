import assert from "node:assert/strict";
import test from "node:test";
import { validateReleasePreflight } from "../scripts/release-preflight.mjs";

test("accepts a stable octo-cli version and its matching tag", () => {
  assert.deepEqual(validateReleasePreflight({ version: "0.1.0" }, "octo-cli-v0.1.0"), {
    ok: true,
    data: { version: "0.1.0", tag: "octo-cli-v0.1.0" },
  });
});

test("rejects unstable versions and mismatched tags", () => {
  assert.equal(validateReleasePreflight({ version: "0.1.0-beta.1" }).ok, false);
  assert.equal(validateReleasePreflight({ version: "0.1.0" }, "v0.1.0").ok, false);
});
