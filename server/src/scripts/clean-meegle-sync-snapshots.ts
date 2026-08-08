import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sql, type Kysely } from "kysely";
import { MeegleShellClient } from "../adapters/meegle/meegle-shell-client.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";
import type { DatabaseSchema } from "../adapters/postgres/schema.js";
import type { MeegleWorkitem } from "../adapters/meegle/meegle-client.js";

const PROJECT_KEY = "4c3fv6";
const PROJECT_NAME = "Tenways Software R&D";
const DETAIL_BATCH_SIZE = 50;
const DETAIL_CONCURRENCY = 3;

type RelationField = "sprint" | "version" | "system" | "bugs";

type RelationValues = Partial<Record<RelationField, string | string[]>>;

const RELATION_FIELD_MAPPING: Record<string, Partial<Record<RelationField, string>>> = {
  story: {
    sprint: "field_feb079",
    version: "field_1b9eb0",
    system: "field_00f541",
    bugs: "field_9edc03",
  },
  "66700acbf297a8f821b4b860": {
    sprint: "field_ecd063",
    version: "field_5fab52",
    bugs: "field_3daed9",
  },
  "6932e40429d1cd8aac635c82": {
    sprint: "field_ee999e",
    version: "field_c6f6d0",
    system: "field_4976fc",
  },
};

interface SnapshotRow {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
}

interface RelationUpdate extends SnapshotRow {
  values: RelationValues;
}

export function parseArgs(argv: string[]): { apply: boolean } {
  if (argv.length === 0) {
    return { apply: false };
  }
  if (argv.length === 1 && argv[0] === "--apply") {
    return { apply: true };
  }
  throw new Error("Usage: pnpm --dir server platform:clean-meegle [--apply]");
}

export function extractRelationValues(workitem: MeegleWorkitem, mapping: Partial<Record<RelationField, string>>): RelationValues {
  const detail = asRecord(workitem.fields);
  const fields = Array.isArray(detail?.work_item_fields) ? detail.work_item_fields.map(asRecord).filter(isRecord) : [];
  const valuesByFieldKey = new Map(fields.map((field) => [stringValue(field.key), field.value]));
  const values: RelationValues = {};
  for (const [semanticField, fieldKey] of Object.entries(mapping) as Array<[RelationField, string]>) {
    const value = toDisplayValue(valuesByFieldKey.get(fieldKey));
    if (value !== undefined) {
      values[semanticField] = value;
    }
  }
  return values;
}

async function preview(db: Kysely<DatabaseSchema>) {
  const result = await sql<{
    candidate_rows: string;
    missing_project_name: string;
    missing_work_item_type: string;
    missing_display_status: string;
    rows_with_verified_status_key: string;
    display_only_status_rows: string;
  }>`
    WITH mapped AS (
      SELECT
        w.status AS raw_status,
        ${PROJECT_NAME}::text AS project_name,
        type_mapping.display_value AS work_item_type,
        status_mapping.display_value AS mapped_status
      FROM meegle_workitem_syncs AS w
      LEFT JOIN meegle_sync_mappings AS type_mapping
        ON type_mapping.project_key = w.project_key
        AND type_mapping.work_item_type_key = w.work_item_type_key
        AND type_mapping.mapping_kind = 'workitem_type'
        AND type_mapping.source_key = w.work_item_type_key
      LEFT JOIN meegle_sync_mappings AS status_mapping
        ON status_mapping.project_key = w.project_key
        AND status_mapping.work_item_type_key = w.work_item_type_key
        AND status_mapping.mapping_kind = 'status'
        AND status_mapping.source_key = COALESCE(w.status_key, w.status)
      WHERE w.project_key = ${PROJECT_KEY}
    )
    SELECT
      COUNT(*)::text AS candidate_rows,
      COUNT(*) FILTER (WHERE project_name IS NULL)::text AS missing_project_name,
      COUNT(*) FILTER (WHERE work_item_type IS NULL)::text AS missing_work_item_type,
      COUNT(*) FILTER (WHERE COALESCE(mapped_status, raw_status) IS NULL)::text AS missing_display_status,
      COUNT(*) FILTER (WHERE mapped_status IS NOT NULL)::text AS rows_with_verified_status_key,
      COUNT(*) FILTER (WHERE mapped_status IS NULL AND raw_status IS NOT NULL)::text AS display_only_status_rows
    FROM mapped
  `.execute(db);
  return result.rows[0];
}

async function loadRelationUpdates(db: Kysely<DatabaseSchema>, client: MeegleShellClient): Promise<{ updates: RelationUpdate[]; missingDetails: number }> {
  const rows = await db.selectFrom("meegle_workitem_syncs")
    .select(["project_key", "work_item_type_key", "work_item_id"])
    .where("project_key", "=", PROJECT_KEY)
    .orderBy("work_item_type_key")
    .orderBy("work_item_id")
    .execute();
  const groups = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const group = groups.get(row.work_item_type_key) ?? [];
    group.push({ projectKey: row.project_key, workItemTypeKey: row.work_item_type_key, workItemId: row.work_item_id });
    groups.set(row.work_item_type_key, group);
  }

  const updates: RelationUpdate[] = [];
  let missingDetails = 0;
  for (const [workItemTypeKey, group] of groups) {
    const mapping = RELATION_FIELD_MAPPING[workItemTypeKey];
    if (!mapping) {
      continue;
    }
    const fieldKeys = Object.values(mapping);
    const batches = chunk(group, DETAIL_BATCH_SIZE);
    const detailBatches = await mapWithConcurrency(batches, DETAIL_CONCURRENCY, (batch) => client.getWorkitemDetails(
      PROJECT_KEY,
      workItemTypeKey,
      batch.map((row) => row.workItemId),
      fieldKeys,
    ));
    for (let index = 0; index < batches.length; index += 1) {
      const detailsById = new Map(detailBatches[index].map((detail) => [detail.id, detail]));
      const missingRows = batches[index].filter((row) => !detailsById.has(row.workItemId));
      const retriedDetails = await mapWithConcurrency(missingRows, DETAIL_CONCURRENCY, async (row) => {
        const [detail] = await client.getWorkitemDetails(PROJECT_KEY, workItemTypeKey, [row.workItemId], fieldKeys);
        return [row.workItemId, detail] as const;
      });
      for (const [workItemId, detail] of retriedDetails) {
        if (detail) {
          detailsById.set(workItemId, detail);
        }
      }
      for (const row of batches[index]) {
        const detail = detailsById.get(row.workItemId);
        if (!detail) {
          missingDetails += 1;
          continue;
        }
        updates.push({ ...row, values: extractRelationValues(detail, mapping) });
      }
    }
  }
  return { updates, missingDetails };
}

async function applyCleanup(db: Kysely<DatabaseSchema>, relationUpdates: RelationUpdate[]): Promise<string> {
  const result = await db.transaction().execute(async (trx) => {
    const standardCleanup = await sql<{ updated_rows: string }>`
      WITH mapped AS (
        SELECT
          w.project_key,
          w.work_item_type_key,
          w.work_item_id,
          ${PROJECT_NAME}::text AS project_name,
          type_mapping.display_value AS work_item_type,
          CASE WHEN status_mapping.source_key IS NULL THEN NULL ELSE COALESCE(w.status_key, w.status) END AS status_key,
          COALESCE(status_mapping.display_value, w.status) AS status
        FROM meegle_workitem_syncs AS w
        JOIN meegle_sync_mappings AS type_mapping
          ON type_mapping.project_key = w.project_key
          AND type_mapping.work_item_type_key = w.work_item_type_key
          AND type_mapping.mapping_kind = 'workitem_type'
          AND type_mapping.source_key = w.work_item_type_key
        LEFT JOIN meegle_sync_mappings AS status_mapping
          ON status_mapping.project_key = w.project_key
          AND status_mapping.work_item_type_key = w.work_item_type_key
          AND status_mapping.mapping_kind = 'status'
          AND status_mapping.source_key = COALESCE(w.status_key, w.status)
        WHERE w.project_key = ${PROJECT_KEY}
      ), updated AS (
        UPDATE meegle_workitem_syncs AS w
        SET
          project_name = mapped.project_name,
          work_item_type = mapped.work_item_type,
          status_key = mapped.status_key,
          status = mapped.status,
          sub_stage_key = NULL,
          sub_stage = NULL,
          synced_at = NOW()::text
        FROM mapped
        WHERE w.project_key = mapped.project_key
          AND w.work_item_type_key = mapped.work_item_type_key
          AND w.work_item_id = mapped.work_item_id
        RETURNING 1
      )
      SELECT COUNT(*)::text AS updated_rows FROM updated
    `.execute(trx);
    const now = new Date().toISOString();
    for (const update of relationUpdates) {
      await trx.updateTable("meegle_workitem_syncs").set({
        sprint: stringRelation(update.values.sprint),
        version: stringRelation(update.values.version),
        system: stringRelation(update.values.system),
        bugs_json: listRelation(update.values.bugs),
        synced_at: now,
      }).where((eb) => eb.and([
        eb("project_key", "=", update.projectKey),
        eb("work_item_type_key", "=", update.workItemTypeKey),
        eb("work_item_id", "=", update.workItemId),
      ])).execute();
    }
    return standardCleanup.rows[0]?.updated_rows ?? "0";
  });
  return result;
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const result = await preview(db);
    if (result.missing_project_name !== "0" || result.missing_work_item_type !== "0" || result.missing_display_status !== "0") {
      throw new Error(`MEEGLE_CLEANUP_VALIDATION_FAILED:${JSON.stringify(result)}`);
    }
    const relations = await loadRelationUpdates(db, new MeegleShellClient());
    if (relations.missingDetails !== 0) {
      throw new Error(`MEEGLE_RELATION_DETAILS_MISSING:${relations.missingDetails}`);
    }
    const updatedRows = apply ? await applyCleanup(db, relations.updates) : "0";
    process.stdout.write(`[meegle-cleanup] ${JSON.stringify({
      ...result,
      relation_rows_planned: relations.updates.length,
      missing_relation_details: relations.missingDetails,
      updated_rows: updatedRows,
    })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

function toDisplayValue(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(toSingleDisplayValue).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values : undefined;
  }
  return toSingleDisplayValue(value);
}

function toSingleDisplayValue(value: unknown): string | undefined {
  const record = asRecord(value);
  const label = stringValue(record?.name) || stringValue(record?.label);
  return label || undefined;
}

function stringRelation(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function listRelation(value: string | string[] | undefined): string | null {
  return Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[meegle-cleanup] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
