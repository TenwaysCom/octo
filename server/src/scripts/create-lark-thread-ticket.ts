import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { DEFAULT_PLATFORM_SYNC_CONFIG_PATH, readPlatformSyncConfig } from "../config/platform-sync-config.js";
import { createPostgresDatabase, ensureLarkThreadTicketIntakeSchema, getDefaultPostgresUri } from "../adapters/postgres/database.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";
import { createLarkThreadTicketIntakeRuntime } from "../application/services/lark-thread-ticket-intake.factory.js";
import { safeIntakeErrorCode } from "../application/services/lark-thread-ticket-intake.service.js";

const argsSchema = z.object({
  chatId: z.string().regex(/^oc_[A-Za-z0-9]+$/),
  messageId: z.string().regex(/^om_[A-Za-z0-9]+$/).optional(),
  threadLink: z.string().url().optional(),
  apply: z.boolean(),
  configPath: z.string().min(1),
}).refine((value) => Boolean(value.messageId) !== Boolean(value.threadLink), "Specify one message ID or one thread link");

export function parseArgs(argv: string[]) {
  const args: Record<string, unknown> = { apply: false, configPath: process.env.PLATFORM_SYNC_CONFIG_PATH || DEFAULT_PLATFORM_SYNC_CONFIG_PATH };
  const names: Record<string, string> = { "--chat-id": "chatId", "--message-id": "messageId", "--thread-link": "threadLink", "--config": "configPath" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--apply") { args.apply = true; continue; }
    const key = names[arg];
    if (!key || !argv[i + 1] || argv[i + 1]!.startsWith("--")) throw new Error("LARK_THREAD_TICKET_ARGUMENT_INVALID");
    args[key] = argv[++i];
  }
  return argsSchema.parse(args);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await readPlatformSyncConfig(args.configPath);
  if (!config.scheduler.tasks.larkThreadTickets?.sources.some((source) => source.chatId === args.chatId)) throw new Error("LARK_THREAD_TICKET_SOURCE_REQUIRED");
  if (!args.apply) {
    process.stdout.write(JSON.stringify({ apply: false, chatId: args.chatId, messageId: args.messageId, threadLink: args.threadLink, note: "Single message only. Add --apply to create, analyze, reply and react." }) + "\n");
    return;
  }
  const connection = await preparePostgresConnection(getDefaultPostgresUri());
  const db = createPostgresDatabase(connection.postgresUri);
  try {
    await ensureLarkThreadTicketIntakeSchema(db);
    const intake = createLarkThreadTicketIntakeRuntime({ db, config });
    const result = args.threadLink
      ? await intake.processThreadLink(args.chatId, args.threadLink)
      : await intake.processMessage(args.chatId, args.messageId!);
    process.stdout.write(JSON.stringify(result) + "\n");
    if (!["done", "existing"].includes(result.status)) process.exitCode = 1;
  } finally {
    await db.destroy();
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`${safeIntakeErrorCode(error)}\n`);
    process.exitCode = 1;
  });
}
