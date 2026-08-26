import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PlatformSyncCoordinator } from "../application/services/platform-sync-coordinator.js";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
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
    const scheduleStore = new PostgresPlatformSyncScheduleStore(db);
    const definitions = buildPlatformSyncScheduleDefinitions(
      config,
      process.env.PLATFORM_SYNC_MASTER_USER_ID,
    );
    await scheduleStore.reconcileConfigSchedules(definitions);
    if (!config.scheduler.enabled) {
      workerLogger.info({
        operation: "platform_sync_scheduler",
        layer: "server",
        stage: "server.sync.scheduler_disabled",
      }, "PLATFORM_SYNC_SCHEDULER_DISABLED");
      await waitUntilAborted(abortController.signal);
      return;
    }

    const syncStore = new PostgresPlatformSyncStore(db);
    const larkTokenStore = new PostgresLarkTokenStore(db);
    configureLocalLarkAuth(larkTokenStore);
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
    await worker.run(abortController.signal);
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
