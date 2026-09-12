import { parseArgs } from "./clean-platform-sync-snapshots.js";

describe("clean-platform-sync-snapshots", () => {
  it("defaults to a non-mutating preview of both platforms", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  it("accepts an explicit platform and apply flag", () => {
    expect(parseArgs(["--only", "github", "--apply"])).toEqual({ only: "github", apply: true });
    expect(parseArgs(["--apply", "--only", "lark"])).toEqual({ only: "lark", apply: true });
    expect(() => parseArgs(["--only", "meegle"])).toThrow("Usage:");
  });
});
