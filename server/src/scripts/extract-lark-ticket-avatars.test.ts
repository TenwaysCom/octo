import { parseArgs } from "./extract-lark-ticket-avatars.js";

const args = ["--base-id", "base", "--table-id", "table", "--start-time", "2026-11-01T00:00:00+08:00", "--end-time", "2026-11-06T00:00:00+08:00"];

describe("extract Lark ticket avatars arguments", () => {
  it("defaults to preview and creation time, and normalizes explicit timezones", () => {
    expect(parseArgs(args)).toEqual({ baseId: "base", tableId: "table", startTime: "2026-10-31T16:00:00.000Z", endTime: "2026-11-05T16:00:00.000Z", timeField: "created_time", apply: false });
    expect(parseArgs(["--", ...args, "--time-field", "synced_at", "--apply"])).toMatchObject({ timeField: "synced_at", apply: true });
  });

  it("rejects incomplete scope, invalid or ambiguous time ranges, unsupported columns and unknown flags", () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(args.slice(2))).toThrow();
    expect(() => parseArgs([...args, "--start-time", "2026-11-01"])).toThrow();
    expect(() => parseArgs([...args, "--start-time", "2026-11-01T00:00:00"])).toThrow();
    expect(() => parseArgs([...args, "--start-time", "2026-11-07T00:00:00Z"])).toThrow();
    expect(() => parseArgs([...args, "--end-time", "2026-11-01T00:00:00+08:00"])).toThrow();
    expect(() => parseArgs([...args, "--time-field", "updated_at"])).toThrow();
    expect(() => parseArgs([...args, "--all"])).toThrow();
  });
});
