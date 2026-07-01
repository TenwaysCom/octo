import dotenv from "dotenv";
dotenv.config();

import { buildAuthenticatedLarkClient } from "../src/application/services/lark-auth-client.factory.js";

const MASTER_USER_ID = "a400632e-8d08-4ddf-977d-e8330b0adc5a";
const CHAT_ID = "7538726794547986470";
const MESSAGE_ID = "om_x100b52c24413b0bce2b2962b60ac8a2";

async function main() {
  const { client } = await buildAuthenticatedLarkClient(
    MASTER_USER_ID,
    "https://open.larksuite.com",
    {},
  );

  console.log("=== Test 1: sendMessage to chat_id ===");
  try {
    // @ts-ignore
    const result = await client.request("POST", "/open-apis/im/v1/messages", {
      receive_id: CHAT_ID,
      msg_type: "text",
      content: JSON.stringify({ text: "Test message after scope update" }),
    }, {
      receive_id_type: "chat_id",
    });
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Failed:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && "statusCode" in err) {
      console.error("StatusCode:", (err as { statusCode?: number }).statusCode);
    }
    if (err instanceof Error && "response" in err) {
      console.error("Response:", JSON.stringify((err as { response?: unknown }).response, null, 2));
    }
  }

  console.log("\n=== Test 2: replyToMessage ===");
  try {
    // @ts-ignore
    const result = await client.request("POST", `/open-apis/im/v1/messages/${MESSAGE_ID}/reply`, {
      msg_type: "text",
      content: JSON.stringify({ text: "Test reply after scope update" }),
      reply_in_thread: true,
    });
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Failed:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && "statusCode" in err) {
      console.error("StatusCode:", (err as { statusCode?: number }).statusCode);
    }
    if (err instanceof Error && "response" in err) {
      console.error("Response:", JSON.stringify((err as { response?: unknown }).response, null, 2));
    }
  }

  console.log("\n=== Test 3: addMessageReaction (should still work) ===");
  try {
    // @ts-ignore
    const result = await client.request("POST", `/open-apis/im/v1/messages/${MESSAGE_ID}/reactions`, {
      reaction_type: { emoji_type: "OK" },
    });
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Failed:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && "statusCode" in err) {
      console.error("StatusCode:", (err as { statusCode?: number }).statusCode);
    }
    if (err instanceof Error && "response" in err) {
      console.error("Response:", JSON.stringify((err as { response?: unknown }).response, null, 2));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
