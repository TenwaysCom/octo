/**
 * Meegle API Test Script
 * Tests creating workitems (production bug, user story) via Meegle OpenAPI
 */

import { createHttpMeegleAuthAdapter } from "./src/adapters/meegle/auth-adapter.js";
import { MeegleClient, MeegleAPIError } from "./src/adapters/meegle/meegle-client.js";
import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";
import { getSharedDatabase } from "./src/adapters/postgres/database.js";
import { refreshCredential } from "./src/application/services/meegle-credential.service.js";

// Configuration from .env
const CONFIG = {
  baseUrl: process.env.MEEGLE_BASE_URL || "https://project.larksuite.com",
  pluginId: process.env.MEEGLE_PLUGIN_ID || "",
  pluginSecret: process.env.MEEGLE_PLUGIN_SECRET || "",
  postgresUri: process.env.POSTGRES_URI || "",
};

interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  error?: string;
  data?: unknown;
}

async function getStoredToken(store: PostgresMeegleTokenStore): Promise<{ userToken: string; meegleUserKey: string; masterUserId: string } | null> {
  const db = getSharedDatabase();
  const row = await db.selectFrom("user_tokens")
    .selectAll()
    .where("provider", "=", "meegle")
    .orderBy("updated_at", "desc")
    .limit(1)
    .executeTakeFirst();

  if (row) {
    console.log("✓ Found stored token for user:", row.external_user_key);
    return {
      userToken: row.user_token,
      meegleUserKey: row.external_user_key,
      masterUserId: row.master_user_id,
    };
  }
  return null;
}

async function refreshStoredToken(store: PostgresMeegleTokenStore, masterUserId: string, meegleUserKey: string): Promise<string | null> {
  try {
    const authAdapter = createHttpMeegleAuthAdapter({
      pluginId: CONFIG.pluginId,
      pluginSecret: CONFIG.pluginSecret,
    });

    const result = await refreshCredential(
      { masterUserId, meegleUserKey, baseUrl: CONFIG.baseUrl },
      { authAdapter, tokenStore: store }
    );

    if (result.tokenStatus === "ready") {
      console.log("✓ Token refreshed successfully");
      return result.userToken || null;
    } else {
      console.log("✗ Token refresh failed:", result.errorCode);
      return null;
    }
  } catch (error) {
    console.log("✗ Token refresh error:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function testPluginToken(): Promise<TestResult> {
  const result: TestResult = { name: "Get Plugin Token", status: "failed" };

  try {
    if (!CONFIG.pluginId || !CONFIG.pluginSecret) {
      result.error = "Missing MEEGLE_PLUGIN_ID or MEEGLE_PLUGIN_SECRET in environment";
      result.status = "skipped";
      return result;
    }

    const authAdapter = createHttpMeegleAuthAdapter({
      pluginId: CONFIG.pluginId,
      pluginSecret: CONFIG.pluginSecret,
    });

    const pluginToken = await authAdapter.getPluginToken(CONFIG.baseUrl);

    console.log("✓ Plugin token obtained:", pluginToken.token.slice(0, 20) + "...");
    console.log("  Expires in:", pluginToken.expiresInSeconds, "seconds");

    result.status = "passed";
    result.data = { tokenPrefix: pluginToken.token.slice(0, 20) + "..." };
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

async function testGetSpaces(userToken: string, meegleUserKey: string): Promise<TestResult> {
  const result: TestResult = { name: "Get Spaces (Projects)", status: "failed" };

  try {
    const client = new MeegleClient({
      userToken,
      userKey: meegleUserKey,
      baseUrl: CONFIG.baseUrl,
    });

    const spaces = await client.getSpaces(meegleUserKey);

    console.log(`✓ Retrieved ${spaces.length} spaces:`);
    spaces.forEach((space, i) => {
      console.log(`  ${i + 1}. ${space.name} (${space.project_key})`);
    });

    result.status = "passed";
    result.data = { count: spaces.length, spaces: spaces.map(s => ({ name: s.name, key: s.project_key })) };
  } catch (error) {
    if (error instanceof MeegleAPIError) {
      result.error = `HTTP ${error.statusCode}: ${error.message}`;
      if (error.response) {
        result.error += `\n  Response: ${JSON.stringify(error.response, null, 2)}`;
      }
    } else {
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

async function testGetWorkitemMeta(userToken: string, meegleUserKey: string, projectKey: string): Promise<TestResult> {
  const result: TestResult = { name: `Get Workitem Meta (${projectKey})`, status: "failed" };

  try {
    const client = new MeegleClient({
      userToken,
      userKey: meegleUserKey,
      baseUrl: CONFIG.baseUrl,
    });

    // Try to get meta for bug type first
    try {
      const bugMeta = await client.getWorkitemMeta(projectKey, "bug");
      console.log(`✓ Retrieved bug workitem meta for project ${projectKey}`);
      result.status = "passed";
      result.data = { bugMeta };
      return result;
    } catch {
      // If bug fails, try story
      const storyMeta = await client.getWorkitemMeta(projectKey, "story");
      console.log(`✓ Retrieved story workitem meta for project ${projectKey}`);
      result.status = "passed";
      result.data = { storyMeta };
      return result;
    }
  } catch (error) {
    if (error instanceof MeegleAPIError) {
      result.error = `HTTP ${error.statusCode}: ${error.message}`;
      if (error.response) {
        result.error += `\n  Response: ${JSON.stringify(error.response, null, 2)}`;
      }
    } else {
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

async function testCreateBug(userToken: string, meegleUserKey: string, projectKey: string): Promise<TestResult> {
  const result: TestResult = { name: `Create Production Bug (${projectKey})`, status: "failed" };

  try {
    const client = new MeegleClient({
      userToken,
      userKey: meegleUserKey,
      baseUrl: CONFIG.baseUrl,
    });

    // Create a test bug workitem
    const bugName = `[API Test] Production Bug - ${new Date().toISOString()}`;
    const workitem = await client.createWorkitem({
      projectKey,
      workItemTypeKey: "bug",
      name: bugName,
      fieldValuePairs: [
        { field_key: "description", field_value: "This is a test bug created by API test script" },
      ],
    });

    console.log(`✓ Created bug workitem:`);
    console.log(`  ID: ${workitem.id}`);
    console.log(`  Name: ${workitem.name}`);
    console.log(`  Key: ${workitem.key}`);

    result.status = "passed";
    result.data = { id: workitem.id, name: workitem.name, key: workitem.key };
  } catch (error) {
    if (error instanceof MeegleAPIError) {
      result.error = `HTTP ${error.statusCode}: ${error.message}`;
      if (error.response) {
        result.error += `\n  Response: ${JSON.stringify(error.response, null, 2)}`;
      }
    } else {
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

async function testCreateUserStory(userToken: string, meegleUserKey: string, projectKey: string): Promise<TestResult> {
  const result: TestResult = { name: `Create User Story (${projectKey})`, status: "failed" };

  try {
    const client = new MeegleClient({
      userToken,
      userKey: meegleUserKey,
      baseUrl: CONFIG.baseUrl,
    });

    // Create a test user story workitem
    const storyName = `[API Test] User Story - ${new Date().toISOString()}`;
    const workitem = await client.createWorkitem({
      projectKey,
      workItemTypeKey: "story",
      name: storyName,
      fieldValuePairs: [
        { field_key: "description", field_value: "This is a test user story created by API test script" },
      ],
    });

    console.log(`✓ Created user story workitem:`);
    console.log(`  ID: ${workitem.id}`);
    console.log(`  Name: ${workitem.name}`);
    console.log(`  Key: ${workitem.key}`);

    result.status = "passed";
    result.data = { id: workitem.id, name: workitem.name, key: workitem.key };
  } catch (error) {
    if (error instanceof MeegleAPIError) {
      result.error = `HTTP ${error.statusCode}: ${error.message}`;
      if (error.response) {
        result.error += `\n  Response: ${JSON.stringify(error.response, null, 2)}`;
      }
    } else {
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

async function runTests() {
  console.log("=".repeat(60));
  console.log("Meegle API Test Suite");
  console.log("=".repeat(60));
  console.log();
  console.log("Configuration:");
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Plugin ID: ${CONFIG.pluginId ? CONFIG.pluginId.slice(0, 10) + "..." : "NOT SET"}`);
  console.log(`  Postgres: ${CONFIG.postgresUri ? "SET" : "NOT SET"}`);
  console.log();

  const results: TestResult[] = [];

  // Test 1: Plugin Token
  results.push(await testPluginToken());
  console.log();

  // Check for stored token to run authenticated tests
  const tokenStore = new PostgresMeegleTokenStore();
  const storedToken = await getStoredToken(tokenStore);

  if (!storedToken) {
    console.log("⚠ No stored Meegle token found in database.");
    console.log("  Authenticated tests will be skipped.");
    console.log();
    console.log("To run authenticated tests:");
    console.log("  1. Login to Meegle in your browser");
    console.log("  2. Use the extension to authenticate");
    console.log("  3. Or manually insert a token into the database");
    console.log();

    results.push({ name: "Get Spaces", status: "skipped", error: "No stored token" });
    results.push({ name: "Get Workitem Meta", status: "skipped", error: "No stored token" });
    results.push({ name: "Create Production Bug", status: "skipped", error: "No stored token" });
    results.push({ name: "Create User Story", status: "skipped", error: "No stored token" });
  } else {
    let { userToken, meegleUserKey, masterUserId } = storedToken;
    console.log("Using stored token for user:", meegleUserKey);
    console.log("Token prefix:", userToken.slice(0, 20) + "...");
    console.log();

    // Test 2: Get Spaces (may fail if token expired)
    const spacesResult = await testGetSpaces(userToken, meegleUserKey);

    // If 401, try to refresh token
    if (spacesResult.error?.includes("401")) {
      console.log("⚠ Token expired (401), attempting to refresh...");
      const refreshedToken = await refreshStoredToken(tokenStore, masterUserId, meegleUserKey);

      if (refreshedToken) {
        userToken = refreshedToken;
        console.log("Retrying Get Spaces with refreshed token...");
        const retryResult = await testGetSpaces(userToken, meegleUserKey);
        results.push(retryResult);
      } else {
        console.log("✗ Token refresh failed, skipping authenticated tests");
        results.push(spacesResult);
        results.push({ name: "Get Workitem Meta", status: "skipped", error: "Token expired" });
        results.push({ name: "Create Production Bug", status: "skipped", error: "Token expired" });
        results.push({ name: "Create User Story", status: "skipped", error: "Token expired" });
        printSummary(results);
        return;
      }
    } else {
      results.push(spacesResult);
    }
    console.log();

    // Get project key from spaces result
    const lastResult = results[results.length - 1];
    const spaces = (lastResult.data as { spaces?: Array<{ key: string; name: string }> })?.spaces;
    const projectKey = spaces && spaces.length > 0 ? spaces[0].key : null;

    if (projectKey) {
      console.log(`Using project: ${projectKey}`);
      console.log();

      // Test 3: Get Workitem Types
      results.push(await testGetWorkitemMeta(userToken, meegleUserKey, projectKey));
      console.log();

      // Test 4: Create Bug
      results.push(await testCreateBug(userToken, meegleUserKey, projectKey));
      console.log();

      // Test 5: Create User Story
      results.push(await testCreateUserStory(userToken, meegleUserKey, projectKey));
      console.log();
    } else {
      results.push({ name: "Get Workitem Meta", status: "skipped", error: "No project available" });
      results.push({ name: "Create Production Bug", status: "skipped", error: "No project available" });
      results.push({ name: "Create User Story", status: "skipped", error: "No project available" });
    }
  }

  printSummary(results);
}

function printSummary(results: TestResult[]) {
  // Print Summary
  console.log("=".repeat(60));
  console.log("Test Results Summary");
  console.log("=".repeat(60));

  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;
  const skipped = results.filter(r => r.status === "skipped").length;

  results.forEach((result, i) => {
    const icon = result.status === "passed" ? "✓" : result.status === "skipped" ? "⊘" : "✗";
    console.log(`${icon} ${i + 1}. ${result.name}: ${result.status.toUpperCase()}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log();
  console.log(`Total: ${results.length} tests (${passed} passed, ${failed} failed, ${skipped} skipped)`);
  console.log("=".repeat(60));

  // Exit with error code if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error("Fatal error running tests:", error);
  process.exit(1);
});
