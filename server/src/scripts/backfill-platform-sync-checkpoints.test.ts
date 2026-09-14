import { parseArgs } from "./backfill-platform-sync-checkpoints.js";

describe("backfill-platform-sync-checkpoints", () => {
  it("defaults to a non-mutating all-platform preview", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  it("accepts an explicit platform and apply flag", () => {
    expect(parseArgs(["--only", "meegle", "--apply"])).toEqual({ only: "meegle", apply: true });
    expect(() => parseArgs(["--only", "unknown"])).toThrow("Usage:");
  });
});
