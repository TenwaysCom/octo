import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import type {
  PlatformSyncSchedule,
  PlatformSyncScheduleDefinition,
  PostgresPlatformSyncScheduleStore,
} from "../../adapters/postgres/platform-sync-schedule-store.js";
import type { PlatformSyncConfig } from "../../scripts/platform-sync.js";
import { platformSyncScopeKey } from "../../domain/platform-sync.js";
import {
  executeIncrementalPlatformSyncTarget,
  PlatformSyncCoordinator,
  PlatformSyncCoordinatorError,
} from "./platform-sync-coordinator.js";
import type { PlatformSyncService } from "./platform-sync.service.js";

const workerLogger = logger.child({ module: "platform-sync-worker" });

type ScheduleStore = Pick<PostgresPlatformSyncScheduleStore,
  "reconcileConfigSchedules" | "claimDue" | "markSuccess" | "markCoalesced" | "markTransientFailure" | "markBlocked"
>;
type SyncService = Pick<PlatformSyncService,
  "incrementalSyncLarkBaseTickets" | "incrementalSyncMeegleWorkitems" | "incrementalSyncGitHubPullRequests"
>;
type SyncCoordinator = Pick<PlatformSyncCoordinator, "runIncremental">;

export interface PlatformSyncWorkerRunResult {
  scheduleId: string;
  platform: string;
  scopeKey: string;
  status: "succeeded" | "coalesced" | "retry_scheduled" | "blocked";
  errorCode?: string;
}

export class PlatformSyncWorker {
  constructor(private readonly deps: {
    scheduleStore: ScheduleStore;
    coordinator: SyncCoordinator;
    service: SyncService;
    concurrency: number;
    pollIntervalMs: number;
  }) {}

  async runOnce(now = new Date().toISOString()): Promise<PlatformSyncWorkerRunResult[]> {
    const schedules = await this.deps.scheduleStore.claimDue(this.deps.concurrency, now);
    let meegleChain = Promise.resolve<unknown>(undefined);
    return Promise.all(schedules.map((schedule) => {
      if (schedule.platform !== "meegle") return this.runSchedule(schedule);
      const run = meegleChain.then(() => this.runSchedule(schedule));
      meegleChain = run.catch(() => undefined);
      return run;
    }));
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.runOnce();
      } catch (error) {
        workerLogger.error({
          operation: "platform_sync_scheduler",
          layer: "server",
          stage: "server.sync.scheduler_poll",
          errorCode: "SYNC_SCHEDULER_POLL_FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        }, "PLATFORM_SYNC_SCHEDULER_POLL_FAILED");
      }
      await abortableDelay(this.deps.pollIntervalMs, signal);
    }
  }

  private async runSchedule(schedule: PlatformSyncSchedule): Promise<PlatformSyncWorkerRunResult> {
    const actionRunId = randomUUID();
    const attempt = schedule.retryCount + 1;
    const trigger = schedule.retryCount > 0 ? "retry" : "scheduled";
    const startedAtMs = Date.now();
    let outcome: PlatformSyncWorkerRunResult | undefined;
    workerLogger.info({
      operation: "platform_sync",
      layer: "server",
      stage: "server.sync.schedule_started",
      actionRunId,
      scheduleId: schedule.scheduleId,
      platform: schedule.platform,
      scopeKey: schedule.scopeKey,
      trigger,
      attempt,
    }, "PLATFORM_SYNC_SCHEDULE_STARTED");
    try {
      const result = await this.deps.coordinator.runIncremental({
        platform: schedule.platform,
        scopeKey: schedule.scopeKey,
        trigger,
        actionRunId,
        scheduleId: schedule.scheduleId,
        attempt,
        execute: (checkpoint, context) => executeIncrementalPlatformSyncTarget(this.deps.service, {
          target: schedule.target,
          masterUserId: schedule.masterUserId,
          checkpoint,
          actionRunId: context.actionRunId,
        }),
      });
      await this.deps.scheduleStore.markSuccess(schedule.scheduleId);
      workerLogger.info({
        operation: "platform_sync",
        layer: "server",
        stage: "server.sync.scheduled_completed",
        actionRunId,
        runId: result.runId,
        platform: schedule.platform,
        scopeKey: schedule.scopeKey,
        listed: result.listed,
        synced: result.synced,
        cleaned: result.cleaned ?? 0,
      }, "PLATFORM_SYNC_SCHEDULED_COMPLETED");
      outcome = {
        scheduleId: schedule.scheduleId,
        platform: schedule.platform,
        scopeKey: schedule.scopeKey,
        status: "succeeded",
      };
      return outcome;
    } catch (error) {
      const errorCode = platformSyncErrorCode(error);
      if (errorCode === "SYNC_ALREADY_RUNNING") {
        await this.deps.scheduleStore.markCoalesced(schedule.scheduleId);
        workerLogger.info({
          operation: "platform_sync",
          layer: "server",
          stage: "server.sync.schedule_coalesced",
          errorCode,
          actionRunId,
          platform: schedule.platform,
          scopeKey: schedule.scopeKey,
          scheduleId: schedule.scheduleId,
        }, "PLATFORM_SYNC_SCHEDULE_COALESCED");
        outcome = {
          scheduleId: schedule.scheduleId,
          platform: schedule.platform,
          scopeKey: schedule.scopeKey,
          status: "coalesced",
          errorCode,
        };
        return outcome;
      }
      const retryable = isRetryablePlatformSyncError(error);
      const status = retryable
        ? await this.deps.scheduleStore.markTransientFailure(schedule.scheduleId, errorCode)
        : (await this.deps.scheduleStore.markBlocked(schedule.scheduleId, errorCode), "blocked" as const);
      workerLogger.warn({
        operation: "platform_sync",
        layer: "server",
        stage: retryable ? "server.sync.retry_scheduled" : "server.sync.schedule_blocked",
        errorCode,
        actionRunId,
        platform: schedule.platform,
        scopeKey: schedule.scopeKey,
        scheduleId: schedule.scheduleId,
        retryCount: schedule.retryCount,
      }, retryable ? "PLATFORM_SYNC_RETRY_SCHEDULED" : "PLATFORM_SYNC_SCHEDULE_BLOCKED");
      outcome = {
        scheduleId: schedule.scheduleId,
        platform: schedule.platform,
        scopeKey: schedule.scopeKey,
        status,
        errorCode,
      };
      return outcome;
    } finally {
      workerLogger.info({
        operation: "platform_sync",
        layer: "server",
        stage: "server.sync.schedule_finished",
        actionRunId,
        scheduleId: schedule.scheduleId,
        platform: schedule.platform,
        scopeKey: schedule.scopeKey,
        trigger,
        attempt,
        status: outcome?.status ?? "failed",
        errorCode: outcome?.errorCode,
        durationMs: Math.max(0, Date.now() - startedAtMs),
      }, "PLATFORM_SYNC_SCHEDULE_FINISHED");
    }
  }
}

export function buildPlatformSyncScheduleDefinitions(
  config: PlatformSyncConfig,
  masterUserId: string | undefined,
): PlatformSyncScheduleDefinition[] {
  if (!config.scheduler.enabled) return [];
  if ((config.larkBase.length > 0 || config.meegle.length > 0) && !masterUserId) {
    throw new Error("PLATFORM_SYNC_MASTER_USER_ID is required for scheduled Lark or Meegle sync");
  }
  const definitions: PlatformSyncScheduleDefinition[] = [];
  for (const target of config.larkBase) {
    const scheduledTarget = {
      platform: "lark" as const,
      baseId: target.baseId,
      tableId: target.tableId,
      larkBaseUrl: target.larkBaseUrl,
      titleFieldName: target.titleFieldName,
      statusFieldName: target.statusFieldName,
      sourceUpdatedAtFieldName: target.sourceUpdatedAtFieldName,
    };
    const scopeKey = platformSyncScopeKey(scheduledTarget);
    definitions.push({
      scheduleId: `lark:${scopeKey}`,
      platform: "lark",
      scopeKey,
      intervalSeconds: config.scheduler.intervalsMinutes.lark * 60,
      masterUserId,
      target: scheduledTarget,
    });
  }
  for (const target of config.meegle) {
    for (const workItemTypeKey of target.workItemTypeKeys ?? []) {
      const sourceUpdatedAtMqlFieldName = target.sourceUpdatedAtMqlFieldNames[workItemTypeKey];
      if (!sourceUpdatedAtMqlFieldName) {
        throw new Error(`Scheduled Meegle sync requires sourceUpdatedAtMqlFieldNames.${workItemTypeKey}`);
      }
      const scheduledTarget = {
        platform: "meegle" as const,
        projectKey: target.projectKey,
        workItemTypeKey,
        sourceUpdatedAtMqlFieldName,
      };
      const scopeKey = platformSyncScopeKey(scheduledTarget);
      definitions.push({
        scheduleId: `meegle:${scopeKey}`,
        platform: "meegle",
        scopeKey,
        intervalSeconds: config.scheduler.intervalsMinutes.meegle * 60,
        masterUserId,
        target: scheduledTarget,
      });
    }
  }
  for (const target of config.github) {
    const scheduledTarget = { platform: "github" as const, owner: target.owner, repo: target.repo };
    const scopeKey = platformSyncScopeKey(scheduledTarget);
    definitions.push({
      scheduleId: `github:${scopeKey}`,
      platform: "github",
      scopeKey,
      intervalSeconds: config.scheduler.intervalsMinutes.github * 60,
      target: scheduledTarget,
    });
  }
  return definitions;
}

export function isRetryablePlatformSyncError(error: unknown): boolean {
  const code = platformSyncErrorCode(error);
  if (["PLATFORM_RATE_LIMITED", "SYNC_TIMEOUT", "NETWORK_ERROR"].includes(code)) {
    return true;
  }
  const message = deepestErrorMessage(error).toLowerCase();
  return /(?:429|rate.?limit|timeout|timed out|econnreset|econnrefused|enotfound|fetch failed|socket hang up|\b5\d\d\b)/.test(message);
}

export function platformSyncErrorCode(error: unknown): string {
  if (error instanceof PlatformSyncCoordinatorError && error.code !== "SYNC_FAILED") return error.code;
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof PlatformSyncCoordinatorError && current.code === "SYNC_FAILED" && current.cause !== undefined) {
      current = current.cause;
      continue;
    }
    if ("code" in current && typeof current.code === "string") return current.code.slice(0, 120);
    const match = current.message.match(/^([A-Z][A-Z0-9_]+)(?::|$)/);
    if (match) return match[1]!;
    current = current.cause;
  }
  return "SYNC_FAILED";
}

function deepestErrorMessage(error: unknown): string {
  let current: unknown = error;
  let message = error instanceof Error ? error.message : String(error);
  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
    message = current instanceof Error ? current.message : String(current);
  }
  return message;
}

function abortableDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, durationMs);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
