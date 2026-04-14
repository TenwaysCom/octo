import { getSharedDatabase } from "./src/adapters/postgres/database.js";

async function main() {
  const db = getSharedDatabase();
  const rows = await db.selectFrom("resolved_users").selectAll().limit(5).execute();
  console.log("Resolved Users:");
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(console.error);
