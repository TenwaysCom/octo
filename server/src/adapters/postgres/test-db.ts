import { Kysely, PostgresDialect } from "kysely";
import { DataType, newDb } from "pg-mem";
import { ensurePostgresSchema } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export async function createTestPostgresDatabase() {
  const memoryDb = newDb();
  memoryDb.public.registerFunction({
    name: "length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  });
  const adapter = memoryDb.adapters.createPg();
  const pool = new adapter.Pool();
  const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool,
    }),
  });

  await ensurePostgresSchema(db);

  return {
    db,
    pool,
    memoryDb,
  };
}
