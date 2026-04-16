import dotenv from "dotenv";
dotenv.config();

import { getSharedDatabase } from "../src/adapters/postgres/database.js";

const MASTER_USER_ID = "a400632e-8d08-4ddf-977d-e8330b0adc5a";
const PROJECT_KEY = "4c3fv6";
const WORK_ITEM_TYPE_KEY = "production_bug";
const WORK_ITEM_ID = "11667994";
const BASE_URL = "https://project.larksuite.com";

async function main() {
  const db = getSharedDatabase();
  const row = await db
    .selectFrom("user_tokens")
    .select(["user_token", "external_user_key"])
    .where("master_user_id", "=", MASTER_USER_ID)
    .where("provider", "=", "meegle")
    .executeTakeFirst();

  if (!row) {
    console.error("No Meegle token found for masterUserId:", MASTER_USER_ID);
    process.exit(1);
  }

  const userToken = row.user_token;
  const userKey = row.external_user_key;

  console.log("========================================");
  console.log("Found token for userKey:", userKey);
  console.log("Token suffix:", userToken.slice(-8));
  console.log("========================================\n");

  const tests = [
    {
      name: "1) query API with work_item_ids as number[]",
      url: `${BASE_URL}/open_api/${PROJECT_KEY}/work_item/${WORK_ITEM_TYPE_KEY}/query`,
      body: { work_item_ids: [Number(WORK_ITEM_ID)] },
    },
    {
      name: "2) query API with work_item_ids as string[]",
      url: `${BASE_URL}/open_api/${PROJECT_KEY}/work_item/${WORK_ITEM_TYPE_KEY}/query`,
      body: { work_item_ids: [WORK_ITEM_ID] },
    },
    {
      name: "3) filter API with work_item_ids as number[]",
      url: `${BASE_URL}/open_api/${PROJECT_KEY}/work_item/filter`,
      body: {
        work_item_ids: [Number(WORK_ITEM_ID)],
        page_num: 1,
        page_size: 10,
      },
    },
    {
      name: "4) filter API with work_item_ids as string[]",
      url: `${BASE_URL}/open_api/${PROJECT_KEY}/work_item/filter`,
      body: {
        work_item_ids: [WORK_ITEM_ID],
        page_num: 1,
        page_size: 10,
      },
    },
    {
      name: "5) filter_across_project API with simple_names",
      url: `${BASE_URL}/open_api/work_items/filter_across_project`,
      body: {
        work_item_type_key: WORK_ITEM_TYPE_KEY,
        simple_names: [WORK_ITEM_ID],
        page_num: 1,
        page_size: 10,
      },
    },
  ];

  for (const t of tests) {
    console.log(`--- ${t.name} ---`);
    const curlBody = JSON.stringify(t.body).replace(/'/g, "'\\''");
    console.log(`curl -X POST '${t.url}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-PLUGIN-TOKEN: ${userToken}' \\
  -H 'X-USER-KEY: ${userKey}' \\
  -d '${curlBody}'`);

    try {
      const res = await fetch(t.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PLUGIN-TOKEN": userToken,
          "X-USER-KEY": userKey,
        },
        body: JSON.stringify(t.body),
      });

      const data = (await res.json()) as Record<string, unknown>;
      console.log("Status:", res.status);
      console.log("Response:", JSON.stringify(data, null, 2));
    } catch (err) {
      console.log("Fetch error:", err instanceof Error ? err.message : String(err));
    }
    console.log("\n");
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
