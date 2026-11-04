import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { DEFAULT_PLATFORM_SYNC_CONFIG_PATH, readPlatformSyncConfig } from "../config/platform-sync-config.js";
import { createPostgresDatabase, ensureLarkTicketDoneSchema, getDefaultPostgresUri } from "../adapters/postgres/database.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";
import { createLarkTicketDoneReactionRuntime } from "../application/services/lark-ticket-done-reaction.factory.js";
import { doneReactionErrorCode } from "../application/services/lark-ticket-done-reaction.service.js";

const argsSchema = z.object({
  baseId: z.string().min(1), tableId: z.string().min(1), recordId: z.string().min(1).optional(),
  startTime: z.iso.datetime({ offset: true }).optional(), endTime: z.iso.datetime({ offset: true }).optional(),
  apply: z.boolean(), configPath: z.string().min(1),
}).refine((value) => value.recordId
  ? !value.startTime && !value.endTime
  : Boolean(value.startTime && value.endTime && Date.parse(value.startTime) < Date.parse(value.endTime) && !value.apply),
"Specify one record, or a read-only time range");

export function parseArgs(argv: string[]) {
  const args: Record<string, unknown> = { apply: false, configPath: process.env.PLATFORM_SYNC_CONFIG_PATH || DEFAULT_PLATFORM_SYNC_CONFIG_PATH };
  const names: Record<string, string> = { "--base-id": "baseId", "--table-id": "tableId", "--record-id": "recordId",
    "--start-time": "startTime", "--end-time": "endTime", "--config": "configPath" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--apply") { args.apply = true; continue; }
    const name = names[arg];
    if (!name || !argv[i + 1] || argv[i + 1]!.startsWith("--")) throw new Error("LARK_TICKET_DONE_ARGUMENT_INVALID");
    args[name] = argv[++i];
  }
  return argsSchema.parse(args);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await readPlatformSyncConfig(args.configPath);
  const connection = await preparePostgresConnection(getDefaultPostgresUri());
  const db = createPostgresDatabase(connection.postgresUri);
  try {
    if (args.apply) await ensureLarkTicketDoneSchema(db);
    const runtime = createLarkTicketDoneReactionRuntime({ db, config });
    const result = args.recordId
      ? args.apply ? await runtime.processRecord(args.baseId, args.tableId, args.recordId) : await runtime.previewRecord(args.baseId, args.tableId, args.recordId)
      : await runtime.preview({ baseId: args.baseId, tableId: args.tableId, startTime: args.startTime!, endTime: args.endTime! });
    process.stdout.write(JSON.stringify({ apply: args.apply, result }) + "\n");
    if (args.apply && "status" in result && result.status !== "done") process.exitCode = 1;
  } finally { await db.destroy(); await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => { process.stderr.write(`${doneReactionErrorCode(error)}\n`); process.exitCode = 1; });
}
