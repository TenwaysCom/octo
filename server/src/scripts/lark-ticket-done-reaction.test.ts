import { parseArgs } from "./lark-ticket-done-reaction.js";
import { larkTicketDoneReactionTaskSchema } from "../config/platform-sync-config.js";

describe("Done task configuration and manual entrypoint", () => {
  it("defaults to ten minute polling, five minute overlap and Finish", () => {
    expect(larkTicketDoneReactionTaskSchema.parse({})).toEqual({ enabled: false, intervalMinutes: 10, overlapMinutes: 5, targetStatus: "Finish" });
    expect(larkTicketDoneReactionTaskSchema.parse({ targetStatus: " Resolved " }).targetStatus).toBe("Resolved");
    expect(() => larkTicketDoneReactionTaskSchema.parse({ targetStatus: " " })).toThrow();
  });
  it("keeps previews read only and permits only explicit single-record writes", () => {
    const base = ["--base-id", "base", "--table-id", "table"];
    expect(parseArgs([...base, "--record-id", "rec_1"]).apply).toBe(false);
    expect(parseArgs([...base, "--record-id", "rec_1", "--apply"]).apply).toBe(true);
    const range = [...base, "--start-time", "2026-11-04T10:00:00+08:00", "--end-time", "2026-11-04T10:10:00+08:00"];
    expect(parseArgs(range).apply).toBe(false);
    expect(() => parseArgs([...range, "--apply"])).toThrow();
    expect(() => parseArgs([...range, "--record-id", "rec_1"])).toThrow();
  });
});
