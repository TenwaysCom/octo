/**
 * Test MeegleClient.createWorkitem with the fix
 */

import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";
import { MeegleClient } from "./src/adapters/meegle/meegle-client.js";

async function main() {
  const store = new PostgresMeegleTokenStore();
  const tokens = await store.get({
    masterUserId: "a400632e-8d08-4ddf-977d-e8330b0adc5a",
    meegleUserKey: "7538275242901291040",
    baseUrl: "https://project.larksuite.com",
  });

  if (!tokens) {
    console.log("No tokens found");
    return;
  }

  console.log("Tokens found:");
  console.log("  Plugin token:", tokens.pluginToken?.slice(0, 30) + "...");
  console.log("  User key:", tokens.meegleUserKey);

  const client = new MeegleClient({
    userToken: tokens.pluginToken, // Using plugin token with X-PLUGIN-TOKEN header
    userKey: tokens.meegleUserKey,
    baseUrl: "https://project.larksuite.com",
  });

  // Test 1: Create Issue
  console.log("\n=== Test 1: Create Issue via MeegleClient ===");
  try {
    const issue = await client.createWorkitem({
      projectKey: "4c3fv6",
      workItemTypeKey: "issue",
      name: `[Client Test] Production Bug - ${new Date().toISOString()}`,
      fieldValuePairs: [
        { field_key: "description", field_value: "Test bug from MeegleClient" },
      ],
    });
    console.log("✓ Success! Created issue:");
    console.log("  ID:", issue.id);
    console.log("  Key:", issue.key);
    console.log("  Name:", issue.name);
    console.log("  Type:", issue.type);
  } catch (error) {
    console.error("✗ Failed:", error);
  }

  // Test 2: Create Story
  console.log("\n=== Test 2: Create Story via MeegleClient ===");
  try {
    const story = await client.createWorkitem({
      projectKey: "4c3fv6",
      workItemTypeKey: "story",
      name: `[Client Test] User Story - ${new Date().toISOString()}`,
      fieldValuePairs: [
        { field_key: "description", field_value: "Test story from MeegleClient" },
      ],
    });
    console.log("✓ Success! Created story:");
    console.log("  ID:", story.id);
    console.log("  Key:", story.key);
    console.log("  Name:", story.name);
    console.log("  Type:", story.type);
  } catch (error) {
    console.error("✗ Failed:", error);
  }
}

main().catch(console.error);
