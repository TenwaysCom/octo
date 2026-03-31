import {
  createSqliteDatabase,
  getDefaultDatabasePath,
  resetSqliteDatabase,
} from "../adapters/sqlite/database.js";

function parseArgs(argv: string[]): { reset: boolean; dbPath: string } {
  let reset = false;
  let dbPath = getDefaultDatabasePath();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--reset" || arg === "--recreate") {
      reset = true;
      continue;
    }

    if (arg === "--db" || arg === "--db-path") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing value for --db");
      }

      dbPath = next;
      index += 1;
      continue;
    }
  }

  return { reset, dbPath };
}

function main(): void {
  const { reset, dbPath } = parseArgs(process.argv.slice(2));
  const db = reset
    ? resetSqliteDatabase(dbPath)
    : createSqliteDatabase(dbPath);
  db.close();

  if (reset) {
    console.log(`[db] reset and recreated sqlite database at ${dbPath}`);
    return;
  }

  console.log(`[db] ensured sqlite schema at ${dbPath}`);
}

main();
