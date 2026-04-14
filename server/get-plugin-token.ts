import { getSharedDatabase } from "./src/adapters/postgres/database.js";

async function main() {
  const db = getSharedDatabase();
  const row = await db.selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "meegle")
    .orderBy("updated_at", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!row) {
    console.log("No token found");
    return;
  }

  console.log("export MEEGLE_PLUGIN_TOKEN=" + row.plugin_token);
  console.log("export MEEGLE_USER_KEY=" + row.external_user_key);
}

main().catch(console.error);
