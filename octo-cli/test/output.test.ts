import assert from "node:assert/strict";
import test from "node:test";
import { failure, success } from "../src/output.js";

test("uses a stable success envelope for Agent-readable command output", () => {
  assert.deepEqual(success({ sprintId: "sprint-1" }, { profile: "test" }), {
    ok: true,
    data: { sprintId: "sprint-1" },
    meta: { profile: "test" },
  });
});

test("uses a structured error envelope without copying sensitive values", () => {
  assert.deepEqual(failure(new Error("UNAUTHORIZED token rejected")), {
    ok: false,
    error: { errorCode: "UNAUTHORIZED", errorMessage: "UNAUTHORIZED token rejected" },
  });
});
