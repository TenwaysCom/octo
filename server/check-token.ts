import { getSharedDatabase } from "./src/adapters/postgres/database.js";

async function main() {
  const db = getSharedDatabase();
  const rows = await db.selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "meegle")
    .orderBy("updated_at", "desc")
    .limit(1)
    .execute();

  if (rows.length === 0) {
    console.log("No Meegle tokens found in database");
    return;
  }

  const token = rows[0];
  console.log("Stored Meegle Token:");
  console.log("  Master User ID:", token.master_user_id);
  console.log("  Meegle User Key:", token.external_user_key);
  console.log("  Base URL:", token.base_url);
  console.log("  User Token:", token.user_token?.slice(0, 30) + "...");
  console.log("  User Token Expires At:", token.user_token_expires_at);
  console.log("  Refresh Token:", token.refresh_token ? token.refresh_token.slice(0, 30) + "..." : "none");
  console.log("  Refresh Token Expires At:", token.refresh_token_expires_at);
  console.log("  Credential Status:", token.credential_status);
  console.log("  Last Auth At:", token.last_auth_at);
  console.log("  Last Refresh At:", token.last_refresh_at);
  console.log("  Updated At:", token.updated_at);

  // Check if token is expired
  const expiresAt = token.user_token_expires_at ? new Date(token.user_token_expires_at) : null;
  const now = new Date();
  if (expiresAt) {
    const isExpired = expiresAt <= now;
    console.log("\n  Token Status:", isExpired ? "EXPIRED" : "VALID");
    console.log("  Expires in:", expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / 1000) : "N/A", "seconds");
  }
}

main().catch(console.error);
