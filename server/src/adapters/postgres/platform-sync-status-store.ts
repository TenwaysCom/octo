import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./schema.js";
import type { PlatformSyncPlatform } from "./platform-sync-checkpoint-store.js";
import type { PlatformSyncRunStatus, PlatformSyncRunTrigger } from "./platform-sync-run-store.js";

export interface PlatformSyncScopeRef {
  platform: PlatformSyncPlatform;
  scopeKey: string;
}

export interface PlatformSyncScopeStatus extends PlatformSyncScopeRef {
  scheduled: boolean;
  nextRunAt?: string;
  blockedReason?: string;
  runStatus?: PlatformSyncRunStatus;
  runTrigger?: PlatformSyncRunTrigger;
  lastRunAt?: string;
  lastCompletedAt?: string;
  lastSyncedAt?: string;
  lastErrorCode?: string;
}

export class PostgresPlatformSyncStatusStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async list(scopes: PlatformSyncScopeRef[]): Promise<PlatformSyncScopeStatus[]> {
    return Promise.all(scopes.map(async (scope) => {
      const [schedule, activeRun, latestRun, lastSyncedAt] = await Promise.all([
        this.db.selectFrom("platform_sync_schedules")
          .select(["enabled", "next_run_at", "blocked_reason"])
          .where("platform", "=", scope.platform)
          .where("scope_key", "=", scope.scopeKey)
          .executeTakeFirst(),
        this.db.selectFrom("platform_sync_leases")
          .innerJoin("platform_sync_runs", "platform_sync_runs.run_id", "platform_sync_leases.run_id")
          .select([
            "platform_sync_runs.status as status",
            "platform_sync_runs.trigger as trigger",
            "platform_sync_runs.started_at as started_at",
            "platform_sync_runs.completed_at as completed_at",
            "platform_sync_runs.error_code as error_code",
          ])
          .where("platform_sync_leases.platform", "=", scope.platform)
          .where("platform_sync_leases.scope_key", "=", scope.scopeKey)
          .where("platform_sync_leases.lease_expires_at", ">", new Date().toISOString())
          .executeTakeFirst(),
        this.db.selectFrom("platform_sync_runs")
          .select(["status", "trigger", "started_at", "completed_at", "error_code"])
          .where("platform", "=", scope.platform)
          .where("scope_key", "=", scope.scopeKey)
          .orderBy("started_at", "desc")
          .limit(1)
          .executeTakeFirst(),
        this.latestSnapshotAt(scope),
      ]);
      const visibleRun = activeRun ?? latestRun;
      return {
        ...scope,
        scheduled: schedule?.enabled ?? false,
        nextRunAt: schedule?.next_run_at ?? undefined,
        blockedReason: schedule?.blocked_reason ?? undefined,
        runStatus: visibleRun?.status ?? undefined,
        runTrigger: visibleRun?.trigger ?? undefined,
        lastRunAt: visibleRun?.started_at ?? undefined,
        lastCompletedAt: visibleRun?.completed_at ?? undefined,
        lastSyncedAt,
        lastErrorCode: visibleRun?.error_code ?? undefined,
      };
    }));
  }

  private async latestSnapshotAt(scope: PlatformSyncScopeRef): Promise<string | undefined> {
    const [primaryKey = "", secondaryKey = ""] = scope.scopeKey.split("/", 2);
    if (scope.platform === "lark") {
      const latest = await this.db.selectFrom("lark_base_ticket_syncs")
        .select("synced_at")
        .where("base_id", "=", primaryKey)
        .where("table_id", "=", secondaryKey)
        .orderBy("synced_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return latest?.synced_at ?? undefined;
    }
    if (scope.platform === "meegle") {
      const latest = await this.db.selectFrom("meegle_workitem_syncs")
        .select("synced_at")
        .where("project_key", "=", primaryKey)
        .where("work_item_type_key", "=", secondaryKey)
        .orderBy("synced_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return latest?.synced_at ?? undefined;
    }
    const latest = await this.db.selectFrom("github_pr_syncs")
      .select("synced_at")
      .where("owner", "=", primaryKey)
      .where("repo", "=", secondaryKey)
      .orderBy("synced_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return latest?.synced_at ?? undefined;
  }
}
