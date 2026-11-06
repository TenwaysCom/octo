import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "kysely";
import { z } from "zod";
import { createPostgresDatabase, ensureLarkContactAvatarColumns, getDefaultPostgresUri } from "../adapters/postgres/database.js";
import { PostgresLarkContactStore } from "../adapters/postgres/lark-contact-store.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";
import { extractLarkTicketAvatars } from "../application/services/lark-ticket-avatar-extraction.service.js";
import { logger } from "../logger.js";

const argsSchema = z.object({
  baseId: z.string().trim().min(1),
  tableId: z.string().trim().min(1),
  startTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  endTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  timeField: z.enum(["created_time", "source_updated_at", "synced_at"]),
  apply: z.boolean(),
}).refine((value) => value.startTime < value.endTime, "Start time must precede end time");

const usage = `Usage: pnpm --dir server platform:extract-lark-ticket-avatars -- \\
  --base-id <baseId> --table-id <tableId> \\
  --start-time <ISO timestamp with timezone> --end-time <ISO timestamp with timezone> \\
  [--time-field created_time|source_updated_at|synced_at] [--apply]

Default: read-only preview, created_time in [start, end).
--apply adds avatar columns to lark_contacts and incrementally upserts by open_id.
Only counts are printed; URLs and contact profiles are never printed.
`;

export function parseArgs(argv: string[]) {
  const args: Record<string, unknown> = { apply: false, timeField: "created_time" };
  const names: Record<string, string> = { "--base-id": "baseId", "--table-id": "tableId", "--start-time": "startTime", "--end-time": "endTime", "--time-field": "timeField" };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--apply") { args.apply = true; continue; }
    const name = names[arg];
    if (!name || !argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error("LARK_TICKET_AVATAR_ARGUMENT_INVALID");
    args[name] = argv[++index];
  }
  return argsSchema.parse(args);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { process.stdout.write(usage); return; }
  const args = parseArgs(argv);
  const uri = getDefaultPostgresUri();
  if (!uri) throw new Error("LARK_TICKET_AVATAR_DATABASE_REQUIRED");
  const connection = await preparePostgresConnection(uri);
  const db = createPostgresDatabase(connection.postgresUri);
  try {
    if (args.apply) await ensureLarkContactAvatarColumns(db);
    const run = (store: PostgresLarkContactStore) => extractLarkTicketAvatars(args, { store });
    // Enforce preview's read-only boundary even when the destination has not been migrated.
    const result = args.apply ? await run(new PostgresLarkContactStore(db))
      : await db.transaction().execute(async (trx) => {
        await sql`SET TRANSACTION READ ONLY`.execute(trx);
        return run(new PostgresLarkContactStore(trx));
      });
    process.stdout.write(JSON.stringify({ apply: args.apply, timeField: args.timeField, startTime: args.startTime, endTime: args.endTime, result }) + "\n");
  } finally { await db.destroy(); await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    const errorCode = error instanceof z.ZodError ? "LARK_TICKET_AVATAR_ARGUMENT_INVALID"
      : error instanceof Error && /^LARK_TICKET_AVATAR_[A-Z_]+$/.test(error.message) ? error.message : "LARK_TICKET_AVATAR_EXTRACTION_FAILED";
    logger.error({ layer: "server", module: "lark-ticket-avatar-extraction", stage: "server.avatar.extract", errorCode }, "LARK_TICKET_AVATAR_EXTRACTION_FAILED");
    process.stderr.write(errorCode + "\n");
    process.exitCode = 1;
  });
}
