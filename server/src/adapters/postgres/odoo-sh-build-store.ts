import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface OdooShBuildRecord {
  environment: string;
  projectId: number;
  buildId: number;
  branch: string;
  stage: string;
  odooBranch: string;
  lastBuildStatus: string;
  lastBuildResult: string;
  buildUrl: string | null;
  commitSha: string | null;
  pusherGithubId: string | null;
  headCommitAuthor?: string | null;
  headCommitUrl?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export type OdooShBuildNotificationStatus =
  | "pending_identity"
  | "pending_send"
  | "sending"
  | "sent"
  | "failed"
  | "outcome_unknown";

export interface OdooShBuildNotificationRecord {
  id: string;
  environment: string;
  projectId: number;
  buildId: number;
  status: OdooShBuildNotificationStatus;
  attempts: number;
  nextAttemptAt: string | null;
  claimToken: string | null;
  claimExpiresAt: string | null;
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OdooShBuildUpsertInput {
  buildId: number;
  branch: string;
  stage: string;
  odooBranch: string;
  lastBuildStatus: string;
  lastBuildResult: string;
  buildUrl: string | null;
  commitSha: string | null;
  pusherGithubId: string | null;
  headCommitAuthor?: string | null;
  headCommitUrl?: string | null;
}

export interface OdooShBuildUpdateInput extends OdooShBuildUpsertInput {
  previousPusherGithubId: string | null;
}

export interface OdooShNotificationQueueInput {
  environment: string;
  projectId: number;
  buildId: number;
  status: OdooShBuildNotificationStatus;
}

export interface OdooShSnapshotSyncInput {
  environment: string;
  projectId: number;
  inserts: OdooShBuildUpsertInput[];
  updates: OdooShBuildUpdateInput[];
  touchBuildIds: number[];
  notifications: OdooShNotificationQueueInput[];
  observedAt: string;
  initializeBaseline?: boolean;
}

export interface OdooShSnapshotSyncResult {
  inserted: number;
  updated: number;
  touched: number;
  notificationsQueued: number;
}

export interface OdooShClaimedNotification extends OdooShBuildNotificationRecord {
  claimToken: string;
}

/** 应用层依赖的最小持久化接口；测试可用 mock 注入。 */
export type OdooShBuildStore = Pick<
  PostgresOdooShBuildStore,
  | "hasBuildBaseline"
  | "listBuildsByProject"
  | "applySnapshotSync"
  | "listDueNotificationIds"
  | "claimNotification"
  | "reclaimExpiredClaims"
  | "markNotificationSent"
  | "markNotificationPendingIdentity"
  | "markNotificationRetryableFailure"
  | "markNotificationFailed"
  | "markNotificationOutcomeUnknown"
>;

function toBuildRecord(row: Selectable<DatabaseSchema["odoo_sh_builds"]>): OdooShBuildRecord {
  return {
    environment: row.environment,
    projectId: row.project_id,
    buildId: row.build_id,
    branch: row.branch,
    stage: row.stage,
    odooBranch: row.odoo_branch,
    lastBuildStatus: row.last_build_status,
    lastBuildResult: row.last_build_result,
    buildUrl: row.build_url,
    commitSha: row.commit_sha,
    pusherGithubId: row.pusher_github_id,
    headCommitAuthor: row.head_commit_author,
    headCommitUrl: row.head_commit_url,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  };
}

function toNotificationRecord(row: Selectable<DatabaseSchema["odoo_sh_build_notifications"]>): OdooShBuildNotificationRecord {
  return {
    id: row.id,
    environment: row.environment,
    projectId: row.project_id,
    buildId: row.build_id,
    status: readStatus(row.status),
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    claimToken: row.claim_token,
    claimExpiresAt: row.claim_expires_at,
    messageId: row.message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readStatus(value: string): OdooShBuildNotificationStatus {
  const allowed: OdooShBuildNotificationStatus[] = [
    "pending_identity", "pending_send", "sending", "sent", "failed", "outcome_unknown",
  ];
  return allowed.includes(value as OdooShBuildNotificationStatus)
    ? value as OdooShBuildNotificationStatus
    : "failed";
}

export class PostgresOdooShBuildStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async hasBuildBaseline(environment: string, projectId: number): Promise<boolean> {
    const row = await this.database.selectFrom("odoo_sh_build_sync_state")
      .select("initialized_at").where("environment", "=", environment)
      .where("project_id", "=", projectId).executeTakeFirst();
    return Boolean(row);
  }

  async listBuildsByProject(environment: string, projectId: number): Promise<OdooShBuildRecord[]> {
    const rows = await this.database.selectFrom("odoo_sh_builds")
      .selectAll()
      .where("environment", "=", environment)
      .where("project_id", "=", projectId)
      .execute();
    return rows.map(toBuildRecord);
  }

  /**
   * Applies one snapshot diff in a single transaction so a persisted build state
   * can never exist without its notification task (and vice versa).
   */
  async applySnapshotSync(input: OdooShSnapshotSyncInput): Promise<OdooShSnapshotSyncResult> {
    return await this.database.transaction().execute(async (tx) => {
      for (const insert of input.inserts) {
        await tx.insertInto("odoo_sh_builds").values({
          environment: input.environment,
          project_id: input.projectId,
          build_id: insert.buildId,
          branch: insert.branch,
          stage: insert.stage,
          odoo_branch: insert.odooBranch,
          last_build_status: insert.lastBuildStatus,
          last_build_result: insert.lastBuildResult,
          build_url: insert.buildUrl,
          commit_sha: insert.commitSha,
          pusher_github_id: insert.pusherGithubId,
          head_commit_author: insert.headCommitAuthor ?? null,
          head_commit_url: insert.headCommitUrl ?? null,
          first_seen_at: input.observedAt,
          last_seen_at: input.observedAt,
          updated_at: input.observedAt,
        }).execute();
      }

      for (const update of input.updates) {
        await tx.updateTable("odoo_sh_builds").set({
          branch: update.branch,
          stage: update.stage,
          odoo_branch: update.odooBranch,
          last_build_status: update.lastBuildStatus,
          last_build_result: update.lastBuildResult,
          build_url: update.buildUrl,
          commit_sha: update.commitSha,
          pusher_github_id: update.pusherGithubId,
          head_commit_author: update.headCommitAuthor ?? null,
          head_commit_url: update.headCommitUrl ?? null,
          last_seen_at: input.observedAt,
          updated_at: input.observedAt,
        }).where("environment", "=", input.environment)
          .where("project_id", "=", input.projectId)
          .where("build_id", "=", update.buildId)
          .execute();


      }

      for (const chunk of chunkBuildIds(input.touchBuildIds)) {
        await tx.updateTable("odoo_sh_builds").set({
          last_seen_at: input.observedAt,
        }).where("environment", "=", input.environment)
          .where("project_id", "=", input.projectId)
          .where("build_id", "in", chunk)
          .execute();
      }

      let notificationsQueued = 0;
      for (const notification of input.notifications) {
        const existing = await tx.selectFrom("odoo_sh_build_notifications")
          .select(["id", "status"])
          .where("environment", "=", notification.environment)
          .where("project_id", "=", notification.projectId)
          .where("build_id", "=", notification.buildId)
          .executeTakeFirst();
        if (existing) {
          // Only explicitly queued current failures may wake legacy pending_identity rows.
          if (existing.status === "pending_identity" && notification.status === "pending_send") {
            await tx.updateTable("odoo_sh_build_notifications")
              .set({ status: "pending_send", updated_at: input.observedAt, error_code: null, next_attempt_at: null })
              .where("id", "=", existing.id).where("status", "=", "pending_identity").execute();
          }
          continue;
        }
        await tx.insertInto("odoo_sh_build_notifications").values({
          id: randomUUID(),
          environment: notification.environment,
          project_id: notification.projectId,
          build_id: notification.buildId,
          status: notification.status,
          attempts: 0,
          created_at: input.observedAt,
          updated_at: input.observedAt,
        }).execute();
        notificationsQueued += 1;
      }

      if (input.initializeBaseline) {
        await tx.insertInto("odoo_sh_build_sync_state").values({
          environment: input.environment, project_id: input.projectId, initialized_at: input.observedAt,
        }).onConflict((oc) => oc.columns(["environment", "project_id"]).doNothing()).execute();
      }

      return {
        inserted: input.inserts.length,
        updated: input.updates.length,
        touched: input.touchBuildIds.length,
        notificationsQueued,
      };
    });
  }

  async listDueNotificationIds(input: {
    maxAttempts: number;
    now: string;
    limit: number;
  }): Promise<string[]> {
    const rows = await this.database.selectFrom("odoo_sh_build_notifications")
      .select("id")
      .where("status", "=", "pending_send")
      .where("attempts", "<", input.maxAttempts)
      .where((expression) => expression
        .or([
          expression("next_attempt_at", "is", null),
          expression("next_attempt_at", "<=", input.now),
        ]))
      .orderBy("created_at", "asc")
      .limit(input.limit)
      .execute();
    return rows.map((row) => row.id);
  }

  /** Guarded per-row claim: only one concurrent consumer can flip a task to `sending`; each claim counts an attempt. */
  async claimNotification(notificationId: string, claimDurationMs: number, now: string): Promise<OdooShClaimedNotification | undefined> {
    const claimToken = randomUUID();
    const row = await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "sending",
      claim_token: claimToken,
      claim_expires_at: addMilliseconds(now, claimDurationMs),
      attempts: sql`attempts + 1`,
      updated_at: now,
    }).where("id", "=", notificationId)
      .where("status", "=", "pending_send")
      .returning(["id", "environment", "project_id", "build_id", "status", "attempts", "claim_token"])
      .executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      environment: row.environment,
      projectId: row.project_id,
      buildId: row.build_id,
      status: "sending",
      attempts: row.attempts,
      nextAttemptAt: null,
      claimToken: row.claim_token!,
      claimExpiresAt: null,
      messageId: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** A process may have died after delivery. Never resend expired claims without reconciliation. */
  async reclaimExpiredClaims(input: { now: string }): Promise<number> {
    const result = await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "outcome_unknown",
      claim_token: null,
      claim_expires_at: null,
      next_attempt_at: null,
      error_code: "ODOO_SH_NOTIFY_CLAIM_EXPIRED",
      error_message: "通知领取已过期，发送结果待核实，禁止自动重发",
      updated_at: input.now,
    }).where("status", "=", "sending")
      .where("claim_expires_at", "<=", input.now)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async markNotificationSent(notificationId: string, messageId: string, now: string): Promise<void> {
    await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "sent",
      message_id: messageId,
      claim_token: null,
      claim_expires_at: null,
      error_code: null,
      error_message: null,
      updated_at: now,
    }).where("id", "=", notificationId)
      .where("status", "=", "sending")
      .execute();
  }

  async markNotificationPendingIdentity(notificationId: string, now: string): Promise<void> {
    await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "pending_identity",
      claim_token: null,
      claim_expires_at: null,
      error_code: "ODOO_SH_NOTIFY_PUSHER_IDENTITY_MISSING",
      updated_at: now,
    }).where("id", "=", notificationId)
      .where("status", "=", "sending")
      .execute();
  }

  async markNotificationRetryableFailure(notificationId: string, input: {
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: string;
    now: string;
  }): Promise<void> {
    await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "pending_send",
      claim_token: null,
      claim_expires_at: null,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      next_attempt_at: input.nextAttemptAt,
      updated_at: input.now,
    }).where("id", "=", notificationId)
      .where("status", "=", "sending")
      .execute();
  }

  async markNotificationFailed(notificationId: string, input: {
    errorCode: string;
    errorMessage: string;
    now: string;
  }): Promise<void> {
    await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "failed",
      claim_token: null,
      claim_expires_at: null,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      updated_at: input.now,
    }).where("id", "=", notificationId)
      .where("status", "=", "sending")
      .execute();
  }

  async markNotificationOutcomeUnknown(notificationId: string, input: {
    errorCode: string;
    errorMessage: string;
    now: string;
    messageId?: string;
  }): Promise<void> {
    await this.database.updateTable("odoo_sh_build_notifications").set({
      status: "outcome_unknown",
      ...(input.messageId ? { message_id: input.messageId } : {}),
      claim_token: null,
      claim_expires_at: null,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      updated_at: input.now,
    }).where("id", "=", notificationId)
      .where("status", "=", "sending")
      .execute();
  }
}

function chunkBuildIds(buildIds: number[], size = 500): number[][] {
  const chunks: number[][] = [];
  for (let index = 0; index < buildIds.length; index += size) {
    chunks.push(buildIds.slice(index, index + size));
  }
  return chunks;
}

function addMilliseconds(value: string, durationMs: number): string {
  return new Date(new Date(value).getTime() + durationMs).toISOString();
}
