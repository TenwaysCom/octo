import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./schema.js";
import type { PlatformSyncPlatform } from "./platform-sync-checkpoint-store.js";

export interface PlatformSyncLease {
  platform: PlatformSyncPlatform;
  scopeKey: string;
  runId: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

export class PostgresPlatformSyncLeaseStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async acquire(input: {
    platform: PlatformSyncPlatform;
    scopeKey: string;
    runId: string;
    leaseDurationMs: number;
  }, now = new Date().toISOString()): Promise<PlatformSyncLease | undefined> {
    const leaseToken = randomUUID();
    const leaseExpiresAt = addMilliseconds(now, input.leaseDurationMs);
    await this.db.insertInto("platform_sync_leases").values({
      platform: input.platform,
      scope_key: input.scopeKey,
      run_id: input.runId,
      lease_token: leaseToken,
      lease_expires_at: leaseExpiresAt,
      heartbeat_at: now,
      created_at: now,
      updated_at: now,
    }).onConflict((conflict) => conflict.columns(["platform", "scope_key"]).doNothing())
      .execute();

    const current = await this.db.selectFrom("platform_sync_leases")
      .select("lease_token")
      .where("platform", "=", input.platform)
      .where("scope_key", "=", input.scopeKey)
      .executeTakeFirstOrThrow();

    if (current.lease_token !== leaseToken) {
      const updated = await this.db.updateTable("platform_sync_leases").set({
        run_id: input.runId,
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        heartbeat_at: now,
        updated_at: now,
      }).where("platform", "=", input.platform)
        .where("scope_key", "=", input.scopeKey)
        .where("lease_expires_at", "<=", now)
        .returning("lease_token")
        .executeTakeFirst();
      if (!updated) return undefined;
    }

    return {
      platform: input.platform,
      scopeKey: input.scopeKey,
      runId: input.runId,
      leaseToken,
      leaseExpiresAt,
    };
  }

  async heartbeat(lease: PlatformSyncLease, leaseDurationMs: number, now = new Date().toISOString()): Promise<boolean> {
    const result = await this.db.updateTable("platform_sync_leases").set({
      lease_expires_at: addMilliseconds(now, leaseDurationMs),
      heartbeat_at: now,
      updated_at: now,
    }).where("platform", "=", lease.platform)
      .where("scope_key", "=", lease.scopeKey)
      .where("run_id", "=", lease.runId)
      .where("lease_token", "=", lease.leaseToken)
      .executeTakeFirst();
    return result.numUpdatedRows === 1n;
  }

  async isOwner(lease: PlatformSyncLease, now = new Date().toISOString()): Promise<boolean> {
    const row = await this.db.selectFrom("platform_sync_leases")
      .select("lease_token")
      .where("platform", "=", lease.platform)
      .where("scope_key", "=", lease.scopeKey)
      .where("run_id", "=", lease.runId)
      .where("lease_token", "=", lease.leaseToken)
      .where("lease_expires_at", ">", now)
      .executeTakeFirst();
    return Boolean(row);
  }

  async release(lease: PlatformSyncLease): Promise<boolean> {
    const result = await this.db.deleteFrom("platform_sync_leases")
      .where("platform", "=", lease.platform)
      .where("scope_key", "=", lease.scopeKey)
      .where("run_id", "=", lease.runId)
      .where("lease_token", "=", lease.leaseToken)
      .executeTakeFirst();
    return result.numDeletedRows === 1n;
  }
}

function addMilliseconds(value: string, durationMs: number): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp) || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Invalid platform sync lease timing");
  }
  return new Date(timestamp + durationMs).toISOString();
}
