import { logger } from "../../logger.js";
import type { IncrementalPlatformSyncTarget } from "../../domain/platform-sync.js";
import type {
  PlatformSyncCheckpoint,
  PlatformSyncPlatform,
  PostgresPlatformSyncCheckpointStore,
} from "../../adapters/postgres/platform-sync-checkpoint-store.js";
import type {
  PlatformSyncLease,
  PostgresPlatformSyncLeaseStore,
} from "../../adapters/postgres/platform-sync-lease-store.js";
import type {
  PlatformSyncRunCounts,
  PlatformSyncRunMode,
  PlatformSyncRunTrigger,
  PostgresPlatformSyncRunStore,
} from "../../adapters/postgres/platform-sync-run-store.js";
import type { PlatformSyncService } from "./platform-sync.service.js";

const coordinatorLogger = logger.child({ module: "platform-sync-coordinator" });
const DEFAULT_LEASE_DURATION_MS = 20 * 60 * 1000;

export interface IncrementalPlatformSyncResult extends PlatformSyncRunCounts {
  watermarkUpdatedAt: string;
  watermarkTiebreaker: string;
}

type CheckpointStore = Pick<PostgresPlatformSyncCheckpointStore,
  "get" | "markSuccessIfVersion" | "markFailure"
>;
type RunStore = Pick<PostgresPlatformSyncRunStore,
  "start" | "completeSuccess" | "completeFailure" | "completeSkipped" | "heartbeat"
>;
type LeaseStore = Pick<PostgresPlatformSyncLeaseStore,
  "acquire" | "heartbeat" | "isOwner" | "release"
>;

export class PlatformSyncCoordinatorError extends Error {
  constructor(
    readonly code: "SYNC_ALREADY_RUNNING" | "SYNC_CHECKPOINT_REQUIRED" | "SYNC_LEASE_LOST" | "SYNC_CHECKPOINT_CONFLICT" | "SYNC_FAILED",
    message: string,
    options: { cause?: unknown; activeRunId?: string } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PlatformSyncCoordinatorError";
    this.activeRunId = options.activeRunId;
  }

  readonly activeRunId?: string;
}

export class PlatformSyncCoordinator {
  private readonly leaseDurationMs: number;

  constructor(private readonly deps: {
    checkpointStore: CheckpointStore;
    runStore: RunStore;
    leaseStore: LeaseStore;
    leaseDurationMs?: number;
  }) {
    this.leaseDurationMs = deps.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  }

  async runIncremental(input: {
    platform: PlatformSyncPlatform;
    scopeKey: string;
    trigger: PlatformSyncRunTrigger;
    actionRunId?: string;
    scheduleId?: string;
    attempt?: number;
    execute: (
      checkpoint: Required<Pick<PlatformSyncCheckpoint, "watermarkUpdatedAt" | "watermarkTiebreaker">>,
      context: { actionRunId: string; runId: string },
    ) => Promise<IncrementalPlatformSyncResult>;
  }): Promise<IncrementalPlatformSyncResult & { runId: string; actionRunId: string }> {
    const run = await this.deps.runStore.start({
      platform: input.platform,
      scopeKey: input.scopeKey,
      mode: "incremental",
      cleanAfterSync: true,
      trigger: input.trigger,
      actionRunId: input.actionRunId,
      scheduleId: input.scheduleId,
      attempt: input.attempt,
    });
    const lease = await this.deps.leaseStore.acquire({
      platform: input.platform,
      scopeKey: input.scopeKey,
      runId: run.runId,
      leaseDurationMs: this.leaseDurationMs,
    });
    if (!lease) {
      await this.deps.runStore.completeSkipped(
        run.runId,
        "SYNC_ALREADY_RUNNING",
        `Another sync is already running for ${input.platform}:${input.scopeKey}`,
      );
      throw new PlatformSyncCoordinatorError(
        "SYNC_ALREADY_RUNNING",
        `Another sync is already running for ${input.platform}:${input.scopeKey}`,
      );
    }

    const heartbeat = this.startHeartbeat(lease);
    try {
      const checkpoint = await this.deps.checkpointStore.get(input.platform, input.scopeKey);
      if (!checkpoint?.watermarkUpdatedAt || checkpoint.watermarkTiebreaker === undefined) {
        throw new PlatformSyncCoordinatorError(
          "SYNC_CHECKPOINT_REQUIRED",
          `No safe incremental checkpoint exists for ${input.platform}:${input.scopeKey}`,
        );
      }
      const result = await input.execute({
        watermarkUpdatedAt: checkpoint.watermarkUpdatedAt,
        watermarkTiebreaker: checkpoint.watermarkTiebreaker,
      }, { actionRunId: run.actionRunId, runId: run.runId });

      if (!await this.deps.leaseStore.isOwner(lease)) {
        throw new PlatformSyncCoordinatorError(
          "SYNC_LEASE_LOST",
          `The sync lease was lost for ${input.platform}:${input.scopeKey}`,
        );
      }
      const checkpointUpdated = await this.deps.checkpointStore.markSuccessIfVersion({
        ...checkpoint,
        watermarkUpdatedAt: result.watermarkUpdatedAt,
        watermarkTiebreaker: result.watermarkTiebreaker,
      }, checkpoint.version ?? 0);
      if (!checkpointUpdated) {
        throw new PlatformSyncCoordinatorError(
          "SYNC_CHECKPOINT_CONFLICT",
          `The checkpoint changed while syncing ${input.platform}:${input.scopeKey}`,
        );
      }
      await this.deps.runStore.completeSuccess(run.runId, result);
      return { ...result, runId: run.runId, actionRunId: run.actionRunId };
    } catch (error) {
      if (shouldRecordCheckpointFailure(error)) {
        await this.deps.checkpointStore.markFailure(input.platform, input.scopeKey, error).catch(() => undefined);
      }
      await this.deps.runStore.completeFailure(run.runId, error).catch(() => undefined);
      if (error instanceof PlatformSyncCoordinatorError) throw error;
      throw new PlatformSyncCoordinatorError(
        "SYNC_FAILED",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    } finally {
      clearInterval(heartbeat);
      await this.deps.leaseStore.release(lease).catch(() => false);
    }
  }

  async runExclusive<T extends PlatformSyncRunCounts>(input: {
    platform: PlatformSyncPlatform;
    scopeKey: string;
    mode: Exclude<PlatformSyncRunMode, "incremental">;
    cleanAfterSync: boolean;
    trigger: PlatformSyncRunTrigger;
    actionRunId?: string;
    execute: (context: { actionRunId: string; runId: string; startedAt: string }) => Promise<T>;
  }): Promise<T & { runId: string; actionRunId: string }> {
    const run = await this.deps.runStore.start({
      platform: input.platform,
      scopeKey: input.scopeKey,
      mode: input.mode,
      cleanAfterSync: input.cleanAfterSync,
      trigger: input.trigger,
      actionRunId: input.actionRunId,
    });
    const lease = await this.deps.leaseStore.acquire({
      platform: input.platform,
      scopeKey: input.scopeKey,
      runId: run.runId,
      leaseDurationMs: this.leaseDurationMs,
    });
    if (!lease) {
      await this.deps.runStore.completeSkipped(
        run.runId,
        "SYNC_ALREADY_RUNNING",
        `Another sync is already running for ${input.platform}:${input.scopeKey}`,
      );
      throw new PlatformSyncCoordinatorError(
        "SYNC_ALREADY_RUNNING",
        `Another sync is already running for ${input.platform}:${input.scopeKey}`,
      );
    }

    const heartbeat = this.startHeartbeat(lease);
    try {
      const result = await input.execute({
        actionRunId: run.actionRunId,
        runId: run.runId,
        startedAt: run.startedAt,
      });
      if (!await this.deps.leaseStore.isOwner(lease)) {
        throw new PlatformSyncCoordinatorError(
          "SYNC_LEASE_LOST",
          `The sync lease was lost for ${input.platform}:${input.scopeKey}`,
        );
      }
      await this.deps.runStore.completeSuccess(run.runId, result);
      return { ...result, runId: run.runId, actionRunId: run.actionRunId };
    } catch (error) {
      await this.deps.runStore.completeFailure(run.runId, error).catch(() => undefined);
      if (error instanceof PlatformSyncCoordinatorError) throw error;
      throw new PlatformSyncCoordinatorError(
        "SYNC_FAILED",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    } finally {
      clearInterval(heartbeat);
      await this.deps.leaseStore.release(lease).catch(() => false);
    }
  }

  private startHeartbeat(lease: PlatformSyncLease): ReturnType<typeof setInterval> {
    const interval = setInterval(() => {
      void Promise.all([
        this.deps.leaseStore.heartbeat(lease, this.leaseDurationMs),
        this.deps.runStore.heartbeat(lease.runId),
      ]).then(([owned]) => {
        if (!owned) {
          coordinatorLogger.warn({
            operation: "platform_sync",
            layer: "server",
            stage: "server.sync.lease_heartbeat",
            errorCode: "SYNC_LEASE_LOST",
            runId: lease.runId,
            platform: lease.platform,
            scopeKey: lease.scopeKey,
          }, "PLATFORM_SYNC_LEASE_HEARTBEAT_LOST");
        }
      }).catch((error) => {
        coordinatorLogger.warn({
          operation: "platform_sync",
          layer: "server",
          stage: "server.sync.lease_heartbeat",
          errorCode: "SYNC_HEARTBEAT_FAILED",
          runId: lease.runId,
          platform: lease.platform,
          scopeKey: lease.scopeKey,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, "PLATFORM_SYNC_LEASE_HEARTBEAT_FAILED");
      });
    }, Math.max(1_000, Math.floor(this.leaseDurationMs / 3)));
    interval.unref();
    return interval;
  }
}

export async function executeIncrementalPlatformSyncTarget(
  service: Pick<PlatformSyncService,
    "incrementalSyncLarkBaseTickets" | "incrementalSyncMeegleWorkitems" | "incrementalSyncGitHubPullRequests"
  >,
  input: {
    target: IncrementalPlatformSyncTarget;
    masterUserId?: string;
    checkpoint: Required<Pick<PlatformSyncCheckpoint, "watermarkUpdatedAt" | "watermarkTiebreaker">>;
    actionRunId: string;
  },
): Promise<IncrementalPlatformSyncResult> {
  const { target, checkpoint, actionRunId } = input;
  if (target.platform === "lark") {
    if (!input.masterUserId) throw new Error("SYNC_CREDENTIAL_OWNER_REQUIRED:lark");
    return service.incrementalSyncLarkBaseTickets({
      masterUserId: input.masterUserId,
      baseId: target.baseId,
      tableId: target.tableId,
      larkBaseUrl: target.larkBaseUrl,
      titleFieldName: target.titleFieldName,
      statusFieldName: target.statusFieldName,
      sourceUpdatedAtFieldName: target.sourceUpdatedAtFieldName,
      cleanAfterSync: true,
      actionRunId,
      ...checkpoint,
    }) as Promise<IncrementalPlatformSyncResult>;
  }
  if (target.platform === "meegle") {
    if (!input.masterUserId) throw new Error("SYNC_CREDENTIAL_OWNER_REQUIRED:meegle");
    return service.incrementalSyncMeegleWorkitems({
      masterUserId: input.masterUserId,
      projectKey: target.projectKey,
      workItemTypeKeys: [target.workItemTypeKey],
      sourceUpdatedAtMqlFieldNames: target.sourceUpdatedAtMqlFieldName
        ? { [target.workItemTypeKey]: target.sourceUpdatedAtMqlFieldName }
        : undefined,
      cleanAfterSync: true,
      actionRunId,
      ...checkpoint,
    }) as Promise<IncrementalPlatformSyncResult>;
  }
  return service.incrementalSyncGitHubPullRequests({
    owner: target.owner,
    repo: target.repo,
    cleanAfterSync: true,
    actionRunId,
    ...checkpoint,
  }) as Promise<IncrementalPlatformSyncResult>;
}

function shouldRecordCheckpointFailure(error: unknown): boolean {
  return !(error instanceof PlatformSyncCoordinatorError)
    || !["SYNC_ALREADY_RUNNING", "SYNC_LEASE_LOST", "SYNC_CHECKPOINT_CONFLICT"].includes(error.code);
}
