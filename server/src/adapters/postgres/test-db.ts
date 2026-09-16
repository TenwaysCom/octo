import { Kysely, PostgresDialect } from "kysely";
import { DataType, newDb } from "pg-mem";
import { ensurePostgresSchema } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export async function createTestPostgresDatabase() {
  const memoryDb = newDb();
  memoryDb.public.registerFunction({
    name: "strpos",
    args: [DataType.text, DataType.text],
    returns: DataType.integer,
    implementation: (value: string, query: string) => value.indexOf(query) + 1,
  });
  // pg-mem does not ship PostgreSQL's text regex operator.
  memoryDb.public.registerOperator({
    operator: "~",
    left: DataType.text,
    right: DataType.text,
    returns: DataType.bool,
    implementation: (value: string, pattern: string) => new RegExp(pattern).test(value),
  });
  memoryDb.public.registerFunction({
    name: "length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  });
  memoryDb.public.registerFunction({
    name: "substr",
    args: [DataType.text, DataType.integer, DataType.integer],
    returns: DataType.text,
    implementation: (value: string, start: number, length: number) => value.slice(start - 1, start - 1 + length),
  });
  memoryDb.public.registerFunction({
    name: "replace",
    args: [DataType.text, DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (value: string, search: string, replacement: string) => value.split(search).join(replacement),
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
