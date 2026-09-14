import type { Kysely, Transaction } from "kysely";
import type { DatabaseSchema } from "./schema.js";
import {
  incrementalPlatformSyncTargetSchema,
  type IncrementalPlatformSyncTarget,
} from "../../domain/platform-sync.js";
import type { PlatformSyncPlatform } from "./platform-sync-checkpoint-store.js";

const RETRY_BACKOFF_SECONDS = [60, 5 * 60, 15 * 60] as const;

export interface PlatformSyncScheduleDefinition {
  scheduleId: string;
  platform: PlatformSyncPlatform;
  scopeKey: string;
  intervalSeconds: number;
  masterUserId?: string;
  target: IncrementalPlatformSyncTarget;
}

export interface PlatformSyncSchedule extends PlatformSyncScheduleDefinition {
  nextRunAt: string;
  retryCount: number;
}

export class PostgresPlatformSyncScheduleStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async reconcileConfigSchedules(
    definitions: PlatformSyncScheduleDefinition[],
    now = new Date().toISOString(),
  ): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      await transaction.updateTable("platform_sync_schedules").set({
        enabled: false,
        updated_at: now,
      }).where("managed_by", "=", "config").execute();

      for (const definition of definitions) {
        validateDefinition(definition);
        await transaction.insertInto("platform_sync_schedules").values({
          schedule_id: definition.scheduleId,
          platform: definition.platform,
          scope_key: definition.scopeKey,
          interval_seconds: definition.intervalSeconds,
          enabled: true,
          managed_by: "config",
          master_user_id: definition.masterUserId ?? null,
          target_json: JSON.stringify(definition.target),
          next_run_at: now,
          retry_count: 0,
          blocked_reason: null,
          last_enqueued_at: null,
          created_at: now,
          updated_at: now,
        }).onConflict((conflict) => conflict.column("schedule_id").doUpdateSet({
          platform: definition.platform,
          scope_key: definition.scopeKey,
          interval_seconds: definition.intervalSeconds,
          enabled: true,
          managed_by: "config",
          master_user_id: definition.masterUserId ?? null,
          target_json: JSON.stringify(definition.target),
          blocked_reason: null,
          retry_count: 0,
          updated_at: now,
        })).execute();
      }
    });
  }

  async claimDue(limit: number, now = new Date().toISOString()): Promise<PlatformSyncSchedule[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Platform sync claim limit must be positive");
    const candidates = await this.db.selectFrom("platform_sync_schedules")
      .selectAll()
      .where("enabled", "=", true)
      .where("blocked_reason", "is", null)
      .where("next_run_at", "<=", now)
      .orderBy("next_run_at", "asc")
      .limit(limit * 2)
      .execute();
    const claimed: PlatformSyncSchedule[] = [];

    for (const candidate of candidates) {
      if (claimed.length >= limit) break;
      const nextRunAt = addSeconds(now, candidate.interval_seconds);
      const result = await this.db.updateTable("platform_sync_schedules").set({
        next_run_at: nextRunAt,
        last_enqueued_at: now,
        updated_at: now,
      }).where("schedule_id", "=", candidate.schedule_id)
        .where("enabled", "=", true)
        .where("next_run_at", "=", candidate.next_run_at)
        .executeTakeFirst();
      if (result.numUpdatedRows !== 1n) continue;
      claimed.push(toSchedule(candidate, nextRunAt));
    }
    return claimed;
  }

  async markSuccess(scheduleId: string, now = new Date().toISOString()): Promise<void> {
    await this.db.updateTable("platform_sync_schedules").set({
      retry_count: 0,
      blocked_reason: null,
      updated_at: now,
    }).where("schedule_id", "=", scheduleId).execute();
  }

  async markCoalesced(scheduleId: string, now = new Date().toISOString()): Promise<void> {
    await this.markSuccess(scheduleId, now);
  }

  async markTransientFailure(
    scheduleId: string,
    errorCode: string,
    now = new Date().toISOString(),
  ): Promise<"retry_scheduled" | "blocked"> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await transaction.selectFrom("platform_sync_schedules")
        .select(["retry_count", "enabled"])
        .where("schedule_id", "=", scheduleId)
        .executeTakeFirst();
      if (!row?.enabled) return "blocked";
      const retryCount = row.retry_count + 1;
      const delaySeconds = RETRY_BACKOFF_SECONDS[retryCount - 1];
      if (!delaySeconds) {
        await blockSchedule(transaction, scheduleId, `${errorCode}:retry_exhausted`, now);
        return "blocked";
      }
      await transaction.updateTable("platform_sync_schedules").set({
        retry_count: retryCount,
        next_run_at: addSeconds(now, delaySeconds),
        updated_at: now,
      }).where("schedule_id", "=", scheduleId).execute();
      return "retry_scheduled";
    });
  }

  async markBlocked(scheduleId: string, reason: string, now = new Date().toISOString()): Promise<void> {
    await blockSchedule(this.db, scheduleId, reason, now);
  }
}

function toSchedule(row: DatabaseSchema["platform_sync_schedules"], nextRunAt: string): PlatformSyncSchedule {
  const target = incrementalPlatformSyncTargetSchema.parse(JSON.parse(row.target_json));
  return {
    scheduleId: row.schedule_id,
    platform: row.platform,
    scopeKey: row.scope_key,
    intervalSeconds: row.interval_seconds,
    masterUserId: row.master_user_id ?? undefined,
    target,
    nextRunAt,
    retryCount: row.retry_count,
  };
}

function validateDefinition(definition: PlatformSyncScheduleDefinition): void {
  incrementalPlatformSyncTargetSchema.parse(definition.target);
  if (definition.target.platform !== definition.platform) {
    throw new Error(`Schedule ${definition.scheduleId} platform does not match its target`);
  }
  if (!Number.isInteger(definition.intervalSeconds) || definition.intervalSeconds < 60) {
    throw new Error(`Schedule ${definition.scheduleId} interval must be at least 60 seconds`);
  }
}

async function blockSchedule(
  database: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  scheduleId: string,
  reason: string,
  now: string,
): Promise<void> {
  await database.updateTable("platform_sync_schedules").set({
    enabled: false,
    blocked_reason: reason.slice(0, 500),
    updated_at: now,
  }).where("schedule_id", "=", scheduleId).execute();
}

function addSeconds(value: string, seconds: number): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp) || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("Invalid platform sync schedule timing");
  }
  return new Date(timestamp + seconds * 1000).toISOString();
}
