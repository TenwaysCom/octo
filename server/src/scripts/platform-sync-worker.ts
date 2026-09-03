import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PlatformSyncCoordinator } from "../application/services/platform-sync-coordinator.js";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
import { createLarkTicketShadowSummaryService } from "../application/services/lark-ticket-shadow-summary.service.js";
import {
  buildPlatformSyncScheduleDefinitions,
  PlatformSyncWorker,
} from "../application/services/platform-sync-worker.js";
import { buildAuthenticatedLarkClient } from "../application/services/lark-auth-client.factory.js";
import { MeegleShellClient } from "../adapters/meegle/meegle-shell-client.js";
import {
  createPostgresDatabase,
  ensurePostgresSchema,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";
import { PostgresLarkTokenStore } from "../adapters/postgres/lark-token-store.js";
import { PostgresPlatformSyncCheckpointStore } from "../adapters/postgres/platform-sync-checkpoint-store.js";
import { PostgresPlatformSyncLeaseStore } from "../adapters/postgres/platform-sync-lease-store.js";
import { PostgresPlatformSyncRunStore } from "../adapters/postgres/platform-sync-run-store.js";
import { PostgresPlatformSyncScheduleStore } from "../adapters/postgres/platform-sync-schedule-store.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";
import { configureLarkAuthServiceDeps } from "../modules/lark-auth/lark-auth.service.js";
import { logger } from "../logger.js";
import {
  DEFAULT_PLATFORM_SYNC_CONFIG_PATH,
  readPlatformSyncConfig,
} from "./platform-sync.js";

const workerLogger = logger.child({ module: "platform-sync-worker-entrypoint" });

export async function runPlatformSyncWorker(): Promise<void> {
  const postgresUri = getDefaultPostgresUri();
  if (!postgresUri) throw new Error("POSTGRES_URI or DATABASE_URL is required");
  const configPath = process.env.PLATFORM_SYNC_CONFIG_PATH || DEFAULT_PLATFORM_SYNC_CONFIG_PATH;
  const config = await readPlatformSyncConfig(configPath);
  const connection = await preparePostgresConnection(postgresUri);
  const db = createPostgresDatabase(connection.postgresUri);
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await ensurePostgresSchema(db);
    const syncStore = new PostgresPlatformSyncStore(db);
    const larkTokenStore = new PostgresLarkTokenStore(db);
    configureLocalLarkAuth(larkTokenStore);

    const loops: Promise<void>[] = [];
    if (config.scheduler.enabled) {
      const scheduleStore = new PostgresPlatformSyncScheduleStore(db);
      const definitions = buildPlatformSyncScheduleDefinitions(
        config,
        process.env.PLATFORM_SYNC_MASTER_USER_ID,
      );
      await scheduleStore.reconcileConfigSchedules(definitions);
      const meegleShellClient = new MeegleShellClient();
      const service = new PlatformSyncService({
        store: syncStore,
        createMeegleClient: async () => meegleShellClient,
        createLarkClient: async ({ masterUserId, larkBaseUrl }) => {
          const { client } = await buildAuthenticatedLarkClient(
            masterUserId,
            larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.feishu.cn",
            { getLarkTokenStore: () => larkTokenStore },
          );
          return client;
        },
      });
      const coordinator = new PlatformSyncCoordinator({
        checkpointStore: new PostgresPlatformSyncCheckpointStore(db),
        runStore: new PostgresPlatformSyncRunStore(db),
        leaseStore: new PostgresPlatformSyncLeaseStore(db),
        leaseDurationMs: config.scheduler.leaseSeconds * 1000,
      });
      const worker = new PlatformSyncWorker({
        scheduleStore,
        coordinator,
        service,
        concurrency: config.scheduler.concurrency,
        pollIntervalMs: config.scheduler.pollIntervalSeconds * 1000,
      });
      workerLogger.info({
        operation: "platform_sync_scheduler",
        layer: "server",
        stage: "server.sync.scheduler_started",
        schedules: definitions.length,
        concurrency: config.scheduler.concurrency,
        pollIntervalSeconds: config.scheduler.pollIntervalSeconds,
      }, "PLATFORM_SYNC_SCHEDULER_STARTED");
      loops.push(worker.run(abortController.signal));
    } else {
      workerLogger.info({
        operation: "platform_sync_scheduler",
        layer: "server",
        stage: "server.sync.scheduler_disabled",
      }, "PLATFORM_SYNC_SCHEDULER_DISABLED");
    }

    // Shadow summary task: env toggle wins when set, otherwise the task runs
    // when the scheduler master switch and scheduler.tasks.shadow are both on.
    const shadowTask = config.scheduler.tasks.shadow;
    const shadowEnabled = parseBooleanEnv(process.env.LARK_TICKET_SHADOW_SUMMARY_ENABLED)
      ?? (config.scheduler.enabled && shadowTask.enabled);
    const shadowMasterUserId = process.env.PLATFORM_SYNC_MASTER_USER_ID;
    if (shadowEnabled) {
      if (shadowMasterUserId) {
        const shadowService = createLarkTicketShadowSummaryService({
          syncStore,
          masterUserId: shadowMasterUserId,
          larkBaseUrl: config.larkBase[0]?.larkBaseUrl ?? process.env.LARK_BASE_URL,
          ...(shadowTask.settleMinutes ? { settleMs: shadowTask.settleMinutes * 60_000 } : {}),
          ...(shadowTask.batchLimit ? { batchLimit: shadowTask.batchLimit } : {}),
          ...(shadowTask.intervalMinutes ? { pollIntervalMs: shadowTask.intervalMinutes * 60_000 } : {}),
          ...(shadowTask.acpTimeoutSeconds ? { acpTimeoutMs: shadowTask.acpTimeoutSeconds * 1000 } : {}),
        });
        loops.push(shadowService.run(abortController.signal));
        workerLogger.info({
          operation: "lark_ticket_shadow_summary",
          layer: "server",
          stage: "server.shadow.scheduler_started",
        }, "LARK_TICKET_SHADOW_SUMMARY_STARTED");
      } else {
        workerLogger.warn({
          operation: "lark_ticket_shadow_summary",
          layer: "server",
          stage: "server.shadow.scheduler_disabled",
        }, "LARK_TICKET_SHADOW_SUMMARY_DISABLED_MISSING_MASTER_USER");
      }
    }
    if (loops.length === 0) {
      await waitUntilAborted(abortController.signal);
      return;
    }
    await Promise.all(loops);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await db.destroy();
    await connection.close();
  }
}

function configureLocalLarkAuth(tokenStore: PostgresLarkTokenStore): void {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (appId && appSecret) configureLarkAuthServiceDeps({ appId, appSecret, tokenStore });
}

export function waitUntilAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const keepAlive = setInterval(() => undefined, 60_000);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearInterval(keepAlive);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export function isPlatformSyncWorkerEntrypoint(
  moduleUrl = import.meta.url,
  argvPath = process.argv[1],
  pmExecPath = process.env.pm_exec_path,
): boolean {
  return [argvPath, pmExecPath].some((candidate) => {
    if (!candidate) return false;
    try {
      return pathToFileURL(candidate).href === moduleUrl;
    } catch {
      return false;
    }
  });
}

if (isPlatformSyncWorkerEntrypoint()) {
  void runPlatformSyncWorker().catch((error) => {
    workerLogger.error({
      operation: "platform_sync_scheduler",
      layer: "server",
      stage: "server.sync.scheduler_failed",
      errorCode: "SYNC_SCHEDULER_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "PLATFORM_SYNC_SCHEDULER_FAILED");
    process.exitCode = 1;
  });
}
