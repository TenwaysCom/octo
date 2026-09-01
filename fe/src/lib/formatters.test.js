import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime, parsePlatformTimestamp } from "./formatters.js";

test("parses Meegle second-level updated_at values as UTC", () => {
  assert.equal(
    parsePlatformTimestamp("2026-08-06 12:50:56"),
    Date.parse("2026-08-06T12:50:56.000Z"),
  );
  assert.notEqual(formatDateTime("2026-08-06 12:50:56"), "-");
});

test("rejects missing and invalid platform timestamps", () => {
  assert.equal(Number.isNaN(parsePlatformTimestamp("invalid")), true);
  assert.equal(formatDateTime("invalid"), "-");
});
