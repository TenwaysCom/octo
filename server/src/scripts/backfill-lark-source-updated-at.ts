import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "kysely";
import { LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD, normalizeLarkTimestamp } from "../adapters/lark/lark-timestamp.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";

export interface BackfillLarkSourceUpdatedAtArgs {
  apply: boolean;
}

export function parseArgs(argv: string[]): BackfillLarkSourceUpdatedAtArgs {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: pnpm --dir server platform:backfill-lark-source-time [--apply]");
}

type LarkHistoricalSnapshot = {
  base_id: string;
  table_id: string;
  fields_json: string;
  source_updated_at: string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const snapshots = await db.selectFrom("lark_base_ticket_syncs")
      .select(["base_id", "table_id", "fields_json", "source_updated_at"])
      .where("source_updated_at", "is", null)
      .execute();
    const summary = summarizeSnapshots(snapshots);
    let updated = 0;

    if (args.apply && summary.valid > 0) {
      const result = await sql<{ record_id: string }>`
        UPDATE lark_base_ticket_syncs
        SET source_updated_at = to_char(
          to_timestamp((fields_json::jsonb ->> ${LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD})::double precision / 1000.0)
            AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
        WHERE source_updated_at IS NULL
          AND jsonb_typeof(fields_json::jsonb -> ${LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD}) = 'number'
        RETURNING record_id
      `.execute(db);
      updated = result.rows.length;

    }

    process.stdout.write(`[lark-source-time] ${JSON.stringify({
      field: LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD,
      apply: args.apply,
      ...summary,
      updated,
    })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

export function summarizeSnapshots(snapshots: LarkHistoricalSnapshot[]) {
  const scopes = new Map<string, { candidates: number; valid: number; invalid: number }>();
  let valid = 0;
  let invalid = 0;
  for (const snapshot of snapshots) {
    const scope = `${snapshot.base_id}/${snapshot.table_id}`;
    const entry = scopes.get(scope) ?? { candidates: 0, valid: 0, invalid: 0 };
    entry.candidates += 1;
    try {
      const fields = JSON.parse(snapshot.fields_json) as Record<string, unknown>;
      if (normalizeLarkTimestamp(fields[LARK_HISTORICAL_STATUS_RECORD_TIME_FIELD])) {
        entry.valid += 1;
        valid += 1;
      } else {
        entry.invalid += 1;
        invalid += 1;
      }
    } catch {
      entry.invalid += 1;
      invalid += 1;
    }
    scopes.set(scope, entry);
  }
  return {
    candidates: snapshots.length,
    valid,
    invalid,
    scopes: Array.from(scopes, ([scope, counts]) => ({ scope, ...counts })).sort((left, right) => left.scope.localeCompare(right.scope)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[lark-source-time] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
