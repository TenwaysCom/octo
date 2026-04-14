/**
 * Direct Meegle API Test - No database required
 * Tests raw API response format
 */

// Use the same credentials from the successful test
const CONFIG = {
  baseUrl: "https://project.larksuite.com",
  projectKey: "4c3fv6",
  // These need to be filled in from a valid token
  pluginToken: process.env.MEEGLE_PLUGIN_TOKEN || "",
  userKey: process.env.MEEGLE_USER_KEY || "7538275242901291040",
};

async function testCreateIssue() {
  console.log("=== Test 1: Create Issue (Production Bug) ===");

  const idemUuid = crypto.randomUUID();
  console.log("Idempotency UUID:", idemUuid);

  const response = await fetch(`${CONFIG.baseUrl}/open_api/${CONFIG.projectKey}/work_item/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PLUGIN-TOKEN": CONFIG.pluginToken,
      "X-USER-KEY": CONFIG.userKey,
      "X-IDEM-UUID": idemUuid,
    },
    body: JSON.stringify({
      work_item_type_key: "issue",
      name: `[Test] Production Bug - ${new Date().toISOString()}`,
      field_value_pairs: [
        { field_key: "description", field_value: "Test bug from API" },
      ],
    }),
  });

  const data = await response.json();
  console.log("Response status:", response.status);
  console.log("Full response:");
  console.log(JSON.stringify(data, null, 2));

  return data;
}

async function testCreateStory() {
  console.log("\n=== Test 2: Create Story ===");

  const idemUuid = crypto.randomUUID();
  console.log("Idempotency UUID:", idemUuid);

  const response = await fetch(`${CONFIG.baseUrl}/open_api/${CONFIG.projectKey}/work_item/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PLUGIN-TOKEN": CONFIG.pluginToken,
      "X-USER-KEY": CONFIG.userKey,
      "X-IDEM-UUID": idemUuid,
    },
    body: JSON.stringify({
      work_item_type_key: "story",
      name: `[Test] User Story - ${new Date().toISOString()}`,
      field_value_pairs: [
        { field_key: "description", field_value: "Test story from API" },
      ],
    }),
  });

  const data = await response.json();
  console.log("Response status:", response.status);
  console.log("Full response:");
  console.log(JSON.stringify(data, null, 2));

  return data;
}

async function main() {
  if (!CONFIG.pluginToken) {
    console.error("Error: MEEGLE_PLUGIN_TOKEN environment variable is required");
    console.error("Get a valid plugin token from the database or refresh it first");
    process.exit(1);
  }

  console.log("Meegle Direct API Test");
  console.log("Project:", CONFIG.projectKey);
  console.log("User Key:", CONFIG.userKey);
  console.log("Token prefix:", CONFIG.pluginToken.slice(0, 30) + "...");
  console.log();

  try {
    await testCreateIssue();
    await testCreateStory();
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main();
