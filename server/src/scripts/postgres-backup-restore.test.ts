import { describe, expect, it } from "vitest";

import {
  buildDatabaseUri,
  parseArgs,
  resolveBackupFilePath,
} from "./postgres-backup-restore.js";

describe("postgres-backup-restore", () => {
  it("parses backup command with database name", () => {
    expect(parseArgs(["backup", "tenways_octo"])).toEqual({
      command: "backup",
      databaseName: "tenways_octo",
      filePath: undefined,
      backupDir: undefined,
    });
  });

  it("parses restore command with explicit file path", () => {
    expect(
      parseArgs(["restore", "tenways_octo", "--file", "/tmp/tenways_octo.dump"]),
    ).toEqual({
      command: "restore",
      databaseName: "tenways_octo",
      filePath: "/tmp/tenways_octo.dump",
      backupDir: undefined,
    });
  });

  it("builds a database-specific uri from POSTGRES_URI", () => {
    expect(
      buildDatabaseUri(
        "postgres://linyu:pass@192.168.0.7:18078/tenways_octo",
        "tenways_octo_test",
      ),
    ).toBe("postgres://linyu:pass@192.168.0.7:18078/tenways_octo_test");
  });

  it("builds a timestamped backup file path named by database", () => {
    expect(
      resolveBackupFilePath("/tmp/backups", "tenways_octo", new Date("2026-04-24T14:05:06Z")),
    ).toBe("/tmp/backups/tenways_octo-20260424-140506.dump");
  });
});
