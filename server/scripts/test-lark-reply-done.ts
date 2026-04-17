import dotenv from "dotenv";
dotenv.config();

import { buildAuthenticatedLarkClient } from "../src/application/services/lark-auth-client.factory.js";

const MASTER_USER_ID = "a400632e-8d08-4ddf-977d-e8330b0adc5a";
const THREAD_ID = "7628922376503545567";

async function main() {
  const { client } = await buildAuthenticatedLarkClient(
    MASTER_USER_ID,
    "https://open.larksuite.com",
    {},
  );

  console.log("=== Step 1: getThreadMessages ===");
  const threadMessages = await client.getThreadMessages(THREAD_ID);
  console.log("Message count:", threadMessages.items.length);

  const firstMessage = threadMessages.items[0];
  const rootMessageId = firstMessage?.root_id;

  console.log("rootMessageId (for reply + reaction):", rootMessageId);

  if (!rootMessageId) {
    console.error("No root message found, cannot reply.");
    return;
  }

  console.log("\n=== Step 2: replyToMessage in thread ===");
  const replyResult = await client.replyToMessage(
    rootMessageId,
    "text",
    JSON.stringify({ text: "Test reply to root thread from script" }),
    { reply_in_thread: true },
  );
  console.log("Reply success:", replyResult.message_id);

  console.log("\n=== Step 3: addMessageReaction DONE on root message ===");
  await client.addMessageReaction(rootMessageId, "DONE");
  console.log("Reaction DONE added to root message:", rootMessageId);
}

main().catch((err) => {
  console.error("Script failed:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && "statusCode" in err) {
    console.error("StatusCode:", (err as { statusCode?: number }).statusCode);
  }
  if (err instanceof Error && "response" in err) {
    console.error("Response:", JSON.stringify((err as { response?: unknown }).response, null, 2));
  }
  process.exit(1);
});
