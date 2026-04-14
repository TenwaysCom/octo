import { getSharedDatabase } from "./src/adapters/postgres/database.js";

async function main() {
  const db = getSharedDatabase();

  // List all meegle tokens before deletion
  console.log("Current Meegle tokens in database:");
  const tokens = await db.selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "meegle")
    .execute();

  if (tokens.length === 0) {
    console.log("  No tokens found");
    return;
  }

  tokens.forEach((t, i) => {
    console.log(`  ${i + 1}. User: ${t.external_user_key}, Base URL: ${t.base_url}`);
  });

  console.log();
  console.log(`Deleting ${tokens.length} token(s)...`);

  // Delete all meegle tokens
  const result = await db.deleteFrom("user_tokens")
    .where("provider", "=", "meegle")
    .execute();

  console.log("✓ Deleted successfully");

  // Verify deletion
  const remaining = await db.selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "meegle")
    .execute();

  console.log();
  console.log(`Remaining Meegle tokens: ${remaining.length}`);
}

main().catch(console.error);
