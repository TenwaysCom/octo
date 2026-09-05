import type {
  MeegleSprintMembershipSyncItem,
  MeegleWorkitemSyncItem,
} from "../../adapters/postgres/platform-sync-store.js";
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

export interface MeegleSprintWorkitemProjection extends MeegleSprintMembershipSyncItem {
  sprint: string;
  carryoverToSprintId?: string;
  carryoverToSprintName?: string;
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

export function buildMeegleSprintWorkitemProjections(
  memberships: MeegleSprintMembershipSyncItem[],
  sprints: MeegleSprintSnapshot[],
): MeegleSprintWorkitemProjection[] {
  const sprintById = new Map(sprints.map((sprint) => [sprintIdentity(sprint.projectKey, sprint.sprintId), sprint]));
  const membershipsByWorkitem = new Map<string, MeegleSprintMembershipSyncItem[]>();
  for (const membership of memberships) {
    const key = workitemIdentity(membership);
    const current = membershipsByWorkitem.get(key) ?? [];
    current.push(membership);
    membershipsByWorkitem.set(key, current);
  }

  return [...membershipsByWorkitem.values()].flatMap((workitemMemberships) => {
    const ordered = [...workitemMemberships].sort((left, right) => compareMemberships(left, right));
    return ordered.map((membership, index) => {
      const sprint = sprintById.get(sprintIdentity(membership.projectKey, membership.sprintId));
      const next = ordered[index + 1];
      const nextSprint = next?.sprintId === membership.sprintId
        ? undefined
        : sprintById.get(sprintIdentity(next?.projectKey, next?.sprintId));
      const carryover = next && nextSprint && isObservedUnfinishedTransfer(membership, sprint, nextSprint)
        ? { carryoverToSprintId: next.sprintId, carryoverToSprintName: nextSprint.name }
        : {};
      return {
        ...membership,
        sprint: sprint?.name || membership.sprint || membership.sprintId,
        ...carryover,
      };
    });
  });
}

function isObservedUnfinishedTransfer(
  membership: MeegleSprintMembershipSyncItem,
  sprint: MeegleSprintSnapshot | undefined,
  nextSprint: MeegleSprintSnapshot,
): boolean {
  if (membership.membershipSource !== "incremental_observed" || !sprint?.endAt || !nextSprint.startAt || !nextSprint.endAt) {
    return false;
  }
  const sprintEnd = endOfUtcDay(sprint.endAt);
  const finishedAt = parseTimestamp(membership.itemFinishTime);
  return sprintEnd !== undefined && (finishedAt === undefined || finishedAt > sprintEnd);
}

function compareMemberships(left: MeegleSprintMembershipSyncItem, right: MeegleSprintMembershipSyncItem): number {
  return (parseTimestamp(left.addToCycleTime) ?? Number.MAX_SAFE_INTEGER)
    - (parseTimestamp(right.addToCycleTime) ?? Number.MAX_SAFE_INTEGER);
}

function workitemIdentity(item: Pick<MeegleWorkitemSyncItem, "projectKey" | "workItemTypeKey" | "workItemId">): string {
  return `${item.projectKey}\u0000${item.workItemTypeKey}\u0000${item.workItemId}`;
}

function sprintIdentity(projectKey: string | undefined, sprintId: string | undefined): string {
  return `${projectKey ?? ""}\u0000${sprintId ?? ""}`;
}

function parseTimestamp(value: string | undefined): number | undefined {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? undefined : parsed;
}

function endOfUtcDay(value: string): number | undefined {
  const parsed = parseTimestamp(value);
  if (parsed === undefined) return undefined;
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1;
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
