import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs, requiredFlag } from "../src/args.js";

test("parses command positionals and flags", () => {
  const result = parseArgs(["github", "pr", "--owner", "TenwaysCom", "--number", "42"]);
  assert.deepEqual(result.positionals, ["github", "pr"]);
  assert.equal(requiredFlag(result.flags, "owner"), "TenwaysCom");
  assert.equal(requiredFlag(result.flags, "number"), "42");
});

test("rejects a flag without a value", () => {
  assert.throws(() => parseArgs(["sprint", "tasks", "--sprint-id"]), /requires a value/);
});

test("allows explicitly declared boolean flags", () => {
  const result = parseArgs(["doctor", "--offline"], ["offline"]);
  assert.equal(result.flags.get("offline"), "true");
});
