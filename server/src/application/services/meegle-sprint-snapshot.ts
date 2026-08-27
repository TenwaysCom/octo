import type { MeegleWorkitemSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import { isMeegleSprintType } from "../../domain/meegle-workitem-types.js";
import { normalizeTimestamp } from "../../utils/normalize-timestamp.js";

const SPRINT_FIELD_FALLBACKS = {
  description: process.env.MEEGLE_SPRINT_DESCRIPTION_FIELD_KEY || "description",
  schedule: process.env.MEEGLE_SPRINT_SCHEDULE_FIELD_KEY || "field_3729d1",
};

export interface MeegleSprintSnapshot {
  projectKey: string;
  projectName?: string;
  sprintId: string;
  name: string;
  statusKey?: string;
  status?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export function getMeegleSprintDetailFieldKeys(workItemTypeKey: string): string[] {
  return isMeegleSprintType(workItemTypeKey) ? Object.values(SPRINT_FIELD_FALLBACKS) : [];
}

export function buildMeegleSprintSnapshot(item: MeegleWorkitemSyncItem): MeegleSprintSnapshot | undefined {
  if (!isMeegleSprintType(item.workItemTypeKey)) return undefined;
  const payload = asRecord(item.sourcePayload?.fields);
  const rawFields = Array.isArray(payload?.work_item_fields) ? payload.work_item_fields.map(asRecord).filter(isRecord) : [];
  const values = new Map(rawFields.map((field) => [stringValue(field.key), field.value]));
  const schedule = asRecord(values.get(SPRINT_FIELD_FALLBACKS.schedule));
  const start = asRecord(schedule?.start_time);
  const end = asRecord(schedule?.end_time);
  const description = readText(values.get(SPRINT_FIELD_FALLBACKS.description));
  const startAt = normalizeTimestamp(start?.iso_time ?? start?.timestamp);
  const endAt = normalizeTimestamp(end?.iso_time ?? end?.timestamp);
  return {
    projectKey: item.projectKey,
    ...(item.projectName ? { projectName: item.projectName } : {}),
    sprintId: item.workItemId,
    name: item.title,
    ...(item.statusKey ? { statusKey: item.statusKey } : {}),
    ...(item.status ? { status: item.status } : {}),
    ...(description ? { description } : {}),
    ...(startAt ? { startAt } : {}),
    ...(endAt ? { endAt } : {}),
    ...(item.sourceUpdatedAt ? { sourceUpdatedAt: item.sourceUpdatedAt } : {}),
    syncedAt: item.syncedAt,
  };
}

function readText(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return stringValue(record?.string_value) || stringValue(record?.text) || stringValue(record?.value);
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
