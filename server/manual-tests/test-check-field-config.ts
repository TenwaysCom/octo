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

  // Check available field configs for issue type
  console.log("=== Issue Type Field Config ===");
  try {
    const issueMeta = await client.getWorkitemMeta("4c3fv6", "issue");
    console.log("Issue fields:", JSON.stringify(issueMeta, null, 2));
  } catch (error: any) {
    console.error("Failed to get issue meta:", error.message);
  }

  // Check available field configs for story type
  console.log("\n=== Story Type Field Config ===");
  try {
    const storyMeta = await client.getWorkitemMeta("4c3fv6", "story");
    console.log("Story fields:", JSON.stringify(storyMeta, null, 2));
  } catch (error: any) {
    console.error("Failed to get story meta:", error.message);
  }
}

main().catch(console.error);
