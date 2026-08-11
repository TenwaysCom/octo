import { larkIncrementalStartWatermark, parseArgs } from "./reset-lark-incremental-checkpoint.js";

describe("reset-lark-incremental-checkpoint", () => {
  it("requires an exact Lark scope and an explicit apply flag for writes", () => {
    expect(parseArgs(["--scope", "base/table"])).toEqual({ apply: false, scope: "base/table" });
    expect(parseArgs(["--scope", "base/table", "--apply"])).toEqual({ apply: true, scope: "base/table" });
    expect(() => parseArgs([])).toThrow("--scope");
    expect(() => parseArgs(["--scope", "base/table/extra"])).toThrow("exact Lark");
  });

  it("starts five minutes before the selected cutover time", () => {
    expect(larkIncrementalStartWatermark(new Date("2026-08-11T10:00:00.000Z")))
      .toBe("2026-08-11T09:55:00.000Z");
  });
});
