import "dotenv/config";
import {
  createPostgresDatabase,
  getDefaultPostgresUri,
  ensurePostgresSchema,
  resetPostgresDatabase,
} from "../adapters/postgres/database.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";

function parseArgs(argv: string[]): { reset: boolean; postgresUri: string } {
  let reset = false;
  let postgresUri = getDefaultPostgresUri();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--reset" || arg === "--recreate") {
      reset = true;
      continue;
    }

    if (arg === "--db" || arg === "--db-path" || arg === "--pg" || arg === "--postgres-uri") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing value for --db");
      }

      postgresUri = next;
      index += 1;
      continue;
    }
  }

  return { reset, postgresUri };
}

async function main(): Promise<void> {
  const { reset, postgresUri } = parseArgs(process.argv.slice(2));
  const connection = await preparePostgresConnection(postgresUri);
  const db = createPostgresDatabase(connection.postgresUri);

  try {
    if (reset) {
      await resetPostgresDatabase(db);
      console.log("[db] reset and recreated postgres schema");
      return;
    }

    await ensurePostgresSchema(db);
    console.log("[db] ensured postgres schema");
  } finally {
    await db.destroy();
    await connection.close();
  }
}

void main();
