import "dotenv/config";
import {
  createPostgresDatabase,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";
import { getSharedLarkTokenStore } from "../adapters/postgres/lark-token-store.js";
import { getResolvedUserStore } from "../adapters/postgres/resolved-user-store.js";
import { fetchLarkUserInfo } from "../modules/lark-auth/lark-auth.service.js";

async function main(): Promise<void> {
  const larkAppId = process.env.LARK_APP_ID || "";
  const larkAppSecret = process.env.LARK_APP_SECRET || "";

  if (!larkAppId || !larkAppSecret) {
    console.error("Error: LARK_APP_ID and LARK_APP_SECRET are required");
    process.exit(1);
  }

  const postgresUri = getDefaultPostgresUri();
  if (!postgresUri) {
    console.error("Error: POSTGRES_URI or DATABASE_URL is required");
    process.exit(1);
  }

  const db = createPostgresDatabase(postgresUri);

  try {
    const tokenStore = getSharedLarkTokenStore();
    const resolvedUserStore = getResolvedUserStore();

    const { configureLarkAuthServiceDeps } = await import(
      "../modules/lark-auth/lark-auth.service.js"
    );
    configureLarkAuthServiceDeps({
      appId: larkAppId,
      appSecret: larkAppSecret,
      tokenStore,
      oauthSessionStore: await import(
        "../adapters/postgres/lark-oauth-session-store.js"
      ).then((m) => m.getSharedOauthSessionStore()),
      resolvedUserStore,
    });

    const rows = await db
      .selectFrom("user_tokens")
      .select([
        "master_user_id",
        "base_url",
        "user_token",
        "credential_status",
      ])
      .where("provider", "=", "lark")
      .where("user_token", "!=", "")
      .distinctOn(["master_user_id", "base_url"])
      .orderBy("master_user_id", "asc")
      .orderBy("base_url", "asc")
      .orderBy("updated_at", "desc")
      .execute();

    console.log(`Found ${rows.length} Lark token record(s) to process`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
      const masterUserId = row.master_user_id;
      const baseUrl = row.base_url;

      if (row.credential_status === "expired") {
        console.log(`[SKIP] ${masterUserId} token expired`);
        skipped += 1;
        continue;
      }

      try {
        const userInfo = await fetchLarkUserInfo({ masterUserId, baseUrl });
        console.log(userInfo);
        console.log(
          `[OK] ${masterUserId} -> name="${userInfo.name ?? ""}", email="${userInfo.email ?? ""}", avatar="${userInfo.avatarUrl ? "yes" : "no"}"`,
        );
        success += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[FAIL] ${masterUserId} -> ${message}`);
        failed += 1;
      }
    }

    console.log("\nDone.");
    console.log(`  Success: ${success}`);
    console.log(`  Failed:  ${failed}`);
    console.log(`  Skipped: ${skipped}`);
  } finally {
    await db.destroy();
  }
}

void main();
