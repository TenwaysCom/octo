import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./schema.js";

export const PLATFORM_SYNC_PLATFORMS = ["github", "lark", "meegle"] as const;
export type PlatformSyncPlatform = typeof PLATFORM_SYNC_PLATFORMS[number];

export interface PlatformSyncCheckpoint {
  platform: PlatformSyncPlatform;
  scopeKey: string;
  watermarkUpdatedAt?: string;
  watermarkTiebreaker?: string;
  lastSuccessAt?: string;
  lastError?: string;
}

type SnapshotMetadata = {
  platform: PlatformSyncPlatform;
  scopeKey: string;
  sourceUpdatedAt?: string;
  tiebreaker: string;
  syncedAt: string;
};

const MISSING_SOURCE_WATERMARK_ERROR = "Historical snapshot is missing source_updated_at; run one full sync before incremental sync.";

export class PostgresPlatformSyncCheckpointStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listInitialCheckpoints(): Promise<PlatformSyncCheckpoint[]> {
    const snapshots = await this.listSnapshotMetadata();
    const scopes = new Map<string, SnapshotMetadata[]>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.platform}:${snapshot.scopeKey}`;
      const entries = scopes.get(key) ?? [];
      entries.push(snapshot);
      scopes.set(key, entries);
    }

    return Array.from(scopes.values(), (entries) => buildInitialCheckpoint(entries))
      .sort((left, right) => `${left.platform}:${left.scopeKey}`.localeCompare(`${right.platform}:${right.scopeKey}`));
  }

  async createIfMissing(checkpoint: PlatformSyncCheckpoint, now = new Date().toISOString()): Promise<boolean> {
    const existing = await this.db.selectFrom("platform_sync_checkpoints")
      .select("platform")
      .where("platform", "=", checkpoint.platform)
      .where("scope_key", "=", checkpoint.scopeKey)
      .executeTakeFirst();
    if (existing) return false;

    await this.db.insertInto("platform_sync_checkpoints").values({
      platform: checkpoint.platform,
      scope_key: checkpoint.scopeKey,
      watermark_updated_at: checkpoint.watermarkUpdatedAt ?? null,
      watermark_tiebreaker: checkpoint.watermarkTiebreaker ?? null,
      last_success_at: checkpoint.lastSuccessAt ?? null,
      last_error: checkpoint.lastError ?? null,
      created_at: now,
      updated_at: now,
    }).execute();
    return true;
  }

  async initializeMissingWatermark(checkpoint: PlatformSyncCheckpoint, now = new Date().toISOString()): Promise<boolean> {
    if (!checkpoint.watermarkUpdatedAt || !checkpoint.watermarkTiebreaker) return false;

    const existing = await this.get(checkpoint.platform, checkpoint.scopeKey);
    if (!existing) {
      return this.createIfMissing(checkpoint, now);
    }
    if (existing.watermarkUpdatedAt || existing.watermarkTiebreaker) return false;

    await this.db.updateTable("platform_sync_checkpoints").set({
      watermark_updated_at: checkpoint.watermarkUpdatedAt,
      watermark_tiebreaker: checkpoint.watermarkTiebreaker,
      last_success_at: existing.lastSuccessAt ?? checkpoint.lastSuccessAt ?? null,
      last_error: null,
      updated_at: now,
    }).where("platform", "=", checkpoint.platform)
      .where("scope_key", "=", checkpoint.scopeKey)
      .execute();
    return true;
  }

  async resetWatermark(
    platform: PlatformSyncPlatform,
    scopeKey: string,
    watermarkUpdatedAt: string,
    watermarkTiebreaker: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    const existing = await this.get(platform, scopeKey);
    if (!existing) {
      await this.createIfMissing({
        platform,
        scopeKey,
        watermarkUpdatedAt,
        watermarkTiebreaker,
      }, now);
      return;
    }
    await this.db.updateTable("platform_sync_checkpoints").set({
      watermark_updated_at: watermarkUpdatedAt,
      watermark_tiebreaker: watermarkTiebreaker,
      last_success_at: null,
      last_error: null,
      updated_at: now,
    }).where("platform", "=", platform)
      .where("scope_key", "=", scopeKey)
      .execute();
  }

  async get(platform: PlatformSyncPlatform, scopeKey: string): Promise<PlatformSyncCheckpoint | undefined> {
    const row = await this.db.selectFrom("platform_sync_checkpoints")
      .select([
        "platform", "scope_key", "watermark_updated_at", "watermark_tiebreaker", "last_success_at", "last_error",
      ])
      .where("platform", "=", platform)
      .where("scope_key", "=", scopeKey)
      .executeTakeFirst();
    return row ? {
      platform: row.platform,
      scopeKey: row.scope_key,
      watermarkUpdatedAt: row.watermark_updated_at ?? undefined,
      watermarkTiebreaker: row.watermark_tiebreaker ?? undefined,
      lastSuccessAt: row.last_success_at ?? undefined,
      lastError: row.last_error ?? undefined,
    } : undefined;
  }

  async markSuccess(checkpoint: PlatformSyncCheckpoint, now = new Date().toISOString()): Promise<void> {
    await this.db.updateTable("platform_sync_checkpoints").set({
      watermark_updated_at: checkpoint.watermarkUpdatedAt ?? null,
      watermark_tiebreaker: checkpoint.watermarkTiebreaker ?? null,
      last_success_at: now,
      last_error: null,
      updated_at: now,
    }).where("platform", "=", checkpoint.platform)
      .where("scope_key", "=", checkpoint.scopeKey)
      .execute();
  }

  async markFailure(platform: PlatformSyncPlatform, scopeKey: string, error: unknown, now = new Date().toISOString()): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.updateTable("platform_sync_checkpoints").set({
      last_error: message.slice(0, 500),
      updated_at: now,
    }).where("platform", "=", platform)
      .where("scope_key", "=", scopeKey)
      .execute();
  }

  private async listSnapshotMetadata(): Promise<SnapshotMetadata[]> {
    const [github, lark, meegle] = await Promise.all([
      this.db.selectFrom("github_pr_syncs")
        .select(["owner", "repo", "pull_number", "source_updated_at", "synced_at"]).execute(),
      this.db.selectFrom("lark_base_ticket_syncs")
        .select(["base_id", "table_id", "record_id", "source_updated_at", "synced_at"]).execute(),
      this.db.selectFrom("meegle_workitem_syncs")
        .select(["project_key", "work_item_type_key", "work_item_id", "source_updated_at", "synced_at"]).execute(),
    ]);

    return [
      ...github.map((row): SnapshotMetadata => ({
        platform: "github",
        scopeKey: `${row.owner}/${row.repo}`,
        sourceUpdatedAt: row.source_updated_at ?? undefined,
        tiebreaker: String(row.pull_number).padStart(12, "0"),
        syncedAt: row.synced_at,
      })),
      ...meegle.map((row): SnapshotMetadata => ({
        platform: "meegle",
        scopeKey: row.project_key,
        sourceUpdatedAt: row.source_updated_at ?? undefined,
        tiebreaker: `${row.work_item_type_key}:${row.work_item_id}`,
        syncedAt: row.synced_at,
      })),
    ];
  }
}

function buildInitialCheckpoint(entries: SnapshotMetadata[]): PlatformSyncCheckpoint {
  const [first] = entries;
  const latestSyncedAt = entries.reduce((latest, entry) => maxTimestamp(latest, entry.syncedAt), first.syncedAt);
  const hasCompleteSourceWatermark = entries.every((entry) => entry.sourceUpdatedAt);

  if (!hasCompleteSourceWatermark) {
    return {
      platform: first.platform,
      scopeKey: first.scopeKey,
      lastSuccessAt: latestSyncedAt,
      lastError: MISSING_SOURCE_WATERMARK_ERROR,
    };
  }

  const latest = entries.reduce((current, entry) => {
    if (!current) return entry;
    const timestampOrder = compareTimestamp(entry.sourceUpdatedAt!, current.sourceUpdatedAt!);
    return timestampOrder > 0 || (timestampOrder === 0 && entry.tiebreaker > current.tiebreaker) ? entry : current;
  }, undefined as SnapshotMetadata | undefined)!;

  return {
    platform: first.platform,
    scopeKey: first.scopeKey,
    watermarkUpdatedAt: latest.sourceUpdatedAt,
    watermarkTiebreaker: latest.tiebreaker,
    lastSuccessAt: latestSyncedAt,
  };
}

function maxTimestamp(left: string, right: string): string {
  return compareTimestamp(left, right) >= 0 ? left : right;
}

function compareTimestamp(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}
