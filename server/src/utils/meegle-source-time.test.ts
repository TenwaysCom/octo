import {
  formatMeegleSourceUpdatedAt,
  normalizeMeegleDate,
  normalizeMeegleSourceUpdatedAt,
  parseMeegleSourceTimestamp,
} from "./meegle-source-time.js";

describe("Meegle source time normalization", () => {
  it("keeps calendar dates date-only and rejects invalid days", () => {
    expect(normalizeMeegleDate("2026-08-06T12:50:56Z")).toBe("2026-08-06");
    expect(normalizeMeegleDate(1786020656000)).toBe("2026-08-06");
    expect(normalizeMeegleDate("2026-02-31")).toBeUndefined();
  });

  it("emits the Meegle MQL second-level UTC representation", () => {
    expect(normalizeMeegleSourceUpdatedAt(1786020656000)).toBe("2026-08-06 12:50:56");
    expect(normalizeMeegleSourceUpdatedAt("2026-08-06T12:50:56Z")).toBe("2026-08-06 12:50:56");
    expect(formatMeegleSourceUpdatedAt(Date.UTC(2026, 7, 6, 12, 50, 56))).toBe("2026-08-06 12:50:56");
  });

  it("parses both new raw values and legacy ISO checkpoints as UTC", () => {
    expect(parseMeegleSourceTimestamp("2026-08-06 12:50:56"))
      .toBe(parseMeegleSourceTimestamp("2026-08-06T12:50:56.000Z"));
    expect(parseMeegleSourceTimestamp("2026-02-31 12:00:00")).toBeUndefined();
  });
});
