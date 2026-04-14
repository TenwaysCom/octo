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

  // Test 1: Create Production Bug with minimal fields
  console.log("=== Test 1: Create Production Bug (minimal fields) ===");
  try {
    const bug = await client.createWorkitem({
      projectKey: "4c3fv6",
      workItemTypeKey: "6932e40429d1cd8aac635c82", // Production Bug
      name: `[API Test] Production Bug - ${new Date().toISOString()}`,
      templateId: 645025,
      fieldValuePairs: [
        { field_key: "description", field_value: "This is a test production bug from API" },
      ],
    });
    console.log("✓ Success! Created Production Bug:");
    console.log("  ID:", bug.id);
    console.log("  Name:", bug.name);
    console.log("  Type:", bug.type);
    console.log("  URL: https://project.larksuite.com/4c3fv6/production_bug/detail/" + bug.id);
  } catch (error: any) {
    console.error("✗ Failed:", error.message);
    if (error.response) {
      console.error("  Response:", JSON.stringify(error.response, null, 2));
    }
  }

  // Test 2: Try with priority as object
  console.log("\n=== Test 2: Create Production Bug (with priority object) ===");
  try {
    const bug = await client.createWorkitem({
      projectKey: "4c3fv6",
      workItemTypeKey: "6932e40429d1cd8aac635c82",
      name: `[API Test] Production Bug P1 - ${new Date().toISOString()}`,
      templateId: 645025,
      fieldValuePairs: [
        { field_key: "description", field_value: "Testing priority field" },
        { field_key: "priority", field_value: { value: "option_2", label: "P1" } },
      ],
    });
    console.log("✓ Success! Created Production Bug:");
    console.log("  ID:", bug.id);
    console.log("  Name:", bug.name);
  } catch (error: any) {
    console.error("✗ Failed:", error.message);
    if (error.response) {
      console.error("  Response:", JSON.stringify(error.response, null, 2));
    }
  }
}

main().catch(console.error);
