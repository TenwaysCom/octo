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

  const client = new MeegleClient({
    userToken: tokens.pluginToken,
    userKey: tokens.meegleUserKey,
    baseUrl: "https://project.larksuite.com",
  });

  // Test: Create Issue with minimal fields
  console.log("=== Test: Create Issue with NO extra fields ===");
  try {
    const issue = await client.createWorkitem({
      projectKey: "4c3fv6",
      workItemTypeKey: "issue",
      name: `[Field Test] Issue - ${new Date().toISOString()}`,
      fieldValuePairs: [],
    });
    console.log("✓ Success! Created issue:", issue.id);
  } catch (error: any) {
    console.error("✗ Failed:", error.message);
    if (error.response) {
      console.error("  Response:", JSON.stringify(error.response, null, 2));
    }
  }

  // Test: Create Story with minimal fields
  console.log("\n=== Test: Create Story with NO extra fields ===");
  try {
    const story = await client.createWorkitem({
      projectKey: "4c3fv6",
      workItemTypeKey: "story",
      name: `[Field Test] Story - ${new Date().toISOString()}`,
      fieldValuePairs: [],
    });
    console.log("✓ Success! Created story:", story.id);
  } catch (error: any) {
    console.error("✗ Failed:", error.message);
    if (error.response) {
      console.error("  Response:", JSON.stringify(error.response, null, 2));
    }
  }
}

main().catch(console.error);
