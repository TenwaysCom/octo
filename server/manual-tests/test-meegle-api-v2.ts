/**
 * Meegle API Test Script V2
 * Force refresh token before testing
 */

import { createHttpMeegleAuthAdapter } from "./src/adapters/meegle/auth-adapter.js";
import { MeegleClient, MeegleAPIError } from "./src/adapters/meegle/meegle-client.js";
import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";
import { getSharedDatabase } from "./src/adapters/postgres/database.js";

// Configuration
const CONFIG = {
  baseUrl: process.env.MEEGLE_BASE_URL || "https://project.larksuite.com",
  pluginId: process.env.MEEGLE_PLUGIN_ID || "",
  pluginSecret: process.env.MEEGLE_PLUGIN_SECRET || "",
};

const PROJECT_KEY = process.env.MEEGLE_TEST_PROJECT_KEY || "4c3fv6";

async function main() {
  console.log("=".repeat(60));
  console.log("Meegle API Test - Force Token Refresh");
  console.log("=".repeat(60));
  console.log();

  // 1. Get stored token info
  const db = getSharedDatabase();
  const row = await db.selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "meegle")
    .orderBy("updated_at", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!row) {
    console.log("✗ No stored Meegle token found");
    process.exit(1);
  }

  console.log("Stored Token Info:");
  console.log("  Master User ID:", row.master_user_id);
  console.log("  Meegle User Key:", row.external_user_key);
  console.log("  Current User Token:", row.user_token?.slice(0, 30) + "...");
  console.log("  Refresh Token:", row.refresh_token ? row.refresh_token.slice(0, 30) + "..." : "none");
  console.log();

  // 2. Force refresh token
  console.log("Force refreshing token...");
  const authAdapter = createHttpMeegleAuthAdapter({
    pluginId: CONFIG.pluginId,
    pluginSecret: CONFIG.pluginSecret,
  });

  // Get fresh plugin token
  const pluginToken = await authAdapter.getPluginToken(CONFIG.baseUrl);
  console.log("✓ Plugin token:", pluginToken.token.slice(0, 30) + "...");

  if (!row.refresh_token) {
    console.log("✗ No refresh token available");
    process.exit(1);
  }

  // Refresh user token
  const refreshed = await authAdapter.refreshUserToken({
    baseUrl: CONFIG.baseUrl,
    pluginToken: pluginToken.token,
    refreshToken: row.refresh_token,
  });

  console.log("✓ User token refreshed:", refreshed.userToken.slice(0, 30) + "...");
  console.log("  Expires in:", refreshed.expiresInSeconds, "seconds");
  console.log();

  // 3. Save refreshed token to database
  const store = new PostgresMeegleTokenStore();
  const now = new Date().toISOString();
  const expiresAt = refreshed.expiresInSeconds
    ? new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString()
    : undefined;

  await store.save({
    masterUserId: row.master_user_id,
    meegleUserKey: row.external_user_key,
    baseUrl: row.base_url,
    pluginToken: pluginToken.token,
    pluginTokenExpiresAt: pluginToken.expiresInSeconds
      ? new Date(Date.now() + pluginToken.expiresInSeconds * 1000).toISOString()
      : undefined,
    userToken: refreshed.userToken,
    userTokenExpiresAt: expiresAt,
    refreshToken: refreshed.refreshToken || row.refresh_token,
    refreshTokenExpiresAt: refreshed.refreshTokenExpiresInSeconds
      ? new Date(Date.now() + refreshed.refreshTokenExpiresInSeconds * 1000).toISOString()
      : row.refresh_token_expires_at || undefined,
    credentialStatus: "active",
  });

  console.log("✓ Token saved to database");
  console.log();

  // 4. Test API calls with refreshed token
  console.log("Testing API calls with refreshed token...");
  console.log();

  const client = new MeegleClient({
    userToken: refreshed.userToken,
    userKey: row.external_user_key,
    baseUrl: CONFIG.baseUrl,
  });

  // Test 1: Get Spaces
  console.log("Test 1: Get Spaces");
  try {
    const spaces = await client.getSpaces(row.external_user_key);
    console.log(`  ✓ Success! Found ${spaces.length} spaces:`);
    spaces.forEach((s, i) => console.log(`    ${i + 1}. ${s.name} (${s.project_key})`));
  } catch (error) {
    console.log("  ✗ Failed:", error instanceof MeegleAPIError
      ? `HTTP ${error.statusCode}: ${JSON.stringify(error.response)}`
      : String(error));
  }
  console.log();

  // Test 2: Create Bug
  console.log(`Test 2: Create Bug in project ${PROJECT_KEY}`);
  try {
    const workitem = await client.createWorkitem({
      projectKey: PROJECT_KEY,
      workItemTypeKey: "bug",
      name: `[API Test] Production Bug - ${new Date().toISOString()}`,
      fieldValuePairs: [
        { field_key: "description", field_value: "Test bug from API test script" },
      ],
    });
    console.log("  ✓ Success! Created bug:");
    console.log(`    ID: ${workitem.id}`);
    console.log(`    Name: ${workitem.name}`);
    console.log(`    Key: ${workitem.key}`);
  } catch (error) {
    console.log("  ✗ Failed:", error instanceof MeegleAPIError
      ? `HTTP ${error.statusCode}: ${JSON.stringify(error.response)}`
      : String(error));
  }
  console.log();

  // Test 3: Create User Story
  console.log(`Test 3: Create User Story in project ${PROJECT_KEY}`);
  try {
    const workitem = await client.createWorkitem({
      projectKey: PROJECT_KEY,
      workItemTypeKey: "story",
      name: `[API Test] User Story - ${new Date().toISOString()}`,
      fieldValuePairs: [
        { field_key: "description", field_value: "Test user story from API test script" },
      ],
    });
    console.log("  ✓ Success! Created user story:");
    console.log(`    ID: ${workitem.id}`);
    console.log(`    Name: ${workitem.name}`);
    console.log(`    Key: ${workitem.key}`);
  } catch (error) {
    console.log("  ✗ Failed:", error instanceof MeegleAPIError
      ? `HTTP ${error.statusCode}: ${JSON.stringify(error.response)}`
      : String(error));
  }

  console.log();
  console.log("=".repeat(60));
  console.log("Test complete");
  console.log("=".repeat(60));
}

main().catch(console.error);
