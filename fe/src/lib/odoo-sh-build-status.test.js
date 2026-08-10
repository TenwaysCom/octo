import assert from "node:assert/strict";
import test from "node:test";
import { getOdooShBuildTone } from "./odoo-sh-build-status.js";

test("maps Odoo.sh build results to the requested dot colours", () => {
  assert.equal(getOdooShBuildTone("failed"), "failed");
  assert.equal(getOdooShBuildTone("warning"), "warning");
  assert.equal(getOdooShBuildTone("SUCCESS"), "success");
  assert.equal(getOdooShBuildTone("progress"), "unknown");
});
