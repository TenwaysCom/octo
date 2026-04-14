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

  const issueMeta = await client.getWorkitemMeta("4c3fv6", "issue");
  console.log("Issue field keys:");
  issueMeta.forEach((f: any) => console.log(`  - ${f.field_key} (${f.field_name})`));

  console.log("\nStory field keys:");
  const storyMeta = await client.getWorkitemMeta("4c3fv6", "story");
  storyMeta.forEach((f: any) => console.log(`  - ${f.field_key} (${f.field_name})`));
}

main().catch(console.error);
