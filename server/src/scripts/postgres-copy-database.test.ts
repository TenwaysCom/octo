import { describe, expect, it } from "vitest";

import { parseArgs } from "./postgres-copy-database.js";

describe("postgres-copy-database", () => {
  it("parses source and target database names", () => {
    expect(parseArgs(["tenways_octo_test", "tenways_octo_ly_0509"])).toEqual({
      sourceDb: "tenways_octo_test",
      targetDb: "tenways_octo_ly_0509",
    });
  });

  it("throws when source is missing", () => {
    expect(() => parseArgs([""])).toThrow("Usage: <source-db> <target-db>");
  });

  it("throws when target is missing", () => {
    expect(() => parseArgs(["tenways_octo_test"])).toThrow(
      "Usage: <source-db> <target-db>",
    );
  });
});
