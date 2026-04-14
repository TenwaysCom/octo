import { config } from "dotenv";
config();

import { getSharedDatabase } from "../src/adapters/postgres/database.js";

async function main() {
  const db = getSharedDatabase();

  const tokens = await db
    .selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "lark")
    .execute();

  if (tokens.length === 0) {
    console.log("No Lark tokens found.");
    return;
  }

  console.log("Current Lark tokens:");
  tokens.forEach((t, i) => {
    console.log(
      `  ${i + 1}. masterUserId: ${t.master_user_id}, larkUserId: ${t.external_user_key}, baseUrl: ${t.base_url}`,
    );
  });

  console.log(`\nDeleting ${tokens.length} Lark token(s)...`);

  await db
    .deleteFrom("user_tokens")
    .where("provider", "=", "lark")
    .execute();

  console.log("✓ Deleted. You can now re-authorize from the extension popup.");
}

main().catch(console.error);
