import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../../adapters/postgres/schema.js";
import { LarkClient } from "../../adapters/lark/lark-client.js";
import { PostgresLarkThreadTicketIntakeStore } from "../../adapters/postgres/lark-thread-ticket-intake-store.js";
import { PostgresLarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { PostgresPlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PostgresPlatformSyncCheckpointStore } from "../../adapters/postgres/platform-sync-checkpoint-store.js";
import { PostgresPlatformSyncRunStore } from "../../adapters/postgres/platform-sync-run-store.js";
import { PostgresPlatformSyncLeaseStore } from "../../adapters/postgres/platform-sync-lease-store.js";
import { PostgresWorkflowPromptStore } from "../../adapters/postgres/workflow-prompt-store.js";
import { createTicketSummaryJsonCompletionClient } from "../../adapters/ai/ticket-summary-client.js";
import type { PlatformSyncConfig } from "../../config/platform-sync-config.js";
import { PlatformSyncService } from "./platform-sync.service.js";
import { PlatformSyncCoordinator } from "./platform-sync-coordinator.js";
import { createLarkTicketThreadContextService } from "./lark-ticket-thread-context.service.js";
import { createLarkTicketShadowSummaryService } from "./lark-ticket-shadow-summary.service.js";
import { createLarkThreadTicketIntakeService, larkThreadTicketSources } from "./lark-thread-ticket-intake.service.js";

export function createLarkThreadTicketIntakeRuntime(deps: {
  db: Kysely<DatabaseSchema>;
  config: PlatformSyncConfig;
  appId?: string;
  appSecret?: string;
}) {
  const { db, config } = deps;
  const appId = deps.appId ?? process.env.LARK_APP_ID;
  const appSecret = deps.appSecret ?? process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) throw new Error("LARK_THREAD_TICKET_APP_REQUIRED");
  // The shared sync/shadow interfaces call this field masterUserId. For this
  // workflow it is an application principal, never a user's authorization.
  const masterUserId = `lark-app:${appId}`;
  const baseUrl = (value?: string) => value ?? process.env.LARK_BASE_URL ?? "https://open.feishu.cn";
  const sources = larkThreadTicketSources(config).map((source) => ({ ...source, larkBaseUrl: baseUrl(source.larkBaseUrl) }));
  const syncStore = new PostgresPlatformSyncStore(db);
  const promptStore = new PostgresWorkflowPromptStore(db);
  const buildClient = async (_principal: string, baseUrl: string, actionRunId?: string) => ({
    client: new LarkClient({ appId, appSecret, baseUrl, actionRunId }),
  });
  const shadowTask = config.scheduler.tasks.shadow;
  const summaryTimeoutSeconds = shadowTask.summaryTimeoutSeconds ?? shadowTask.deepSeekTimeoutSeconds ?? shadowTask.acpTimeoutSeconds;
  const summaryOptions = summaryTimeoutSeconds ? { timeoutMs: summaryTimeoutSeconds * 1000 } : {};
  const threadContext = createLarkTicketThreadContextService({ store: new PostgresLarkTicketThreadSyncStore(db), buildClient });
  return createLarkThreadTicketIntakeService({
    store: new PostgresLarkThreadTicketIntakeStore(db),
    syncStore,
    masterUserId,
    sources,
    batchLimit: config.scheduler.tasks.larkThreadTickets?.batchLimit,
    pollIntervalMs: (config.scheduler.tasks.larkThreadTickets?.intervalMinutes ?? 1) * 60_000,
    createClient: async (source, actionRunId) => (await buildClient(masterUserId, baseUrl(source.larkBaseUrl), actionRunId)).client,
    summaryTimeoutMs: summaryOptions.timeoutMs,
    syncService: new PlatformSyncService({ store: syncStore, createLarkClient: async (input) => (await buildClient(input.masterUserId, baseUrl(input.larkBaseUrl), input.actionRunId)).client }),
    shadowService: {
      summarizeOne: (ticket, actionRunId) => {
        const source = sources.find((item) => item.baseId === ticket.baseId && item.tableId === ticket.tableId);
        return createLarkTicketShadowSummaryService({ syncStore, promptStore, threadContext, masterUserId,
          larkBaseUrl: baseUrl(source?.larkBaseUrl), ticketSummaryClient: createTicketSummaryJsonCompletionClient(summaryOptions),
        }).summarizeOne(ticket, actionRunId);
      },
    },
    coordinator: new PlatformSyncCoordinator({ checkpointStore: new PostgresPlatformSyncCheckpointStore(db),
      runStore: new PostgresPlatformSyncRunStore(db), leaseStore: new PostgresPlatformSyncLeaseStore(db),
      leaseDurationMs: config.scheduler.leaseSeconds * 1000,
    }),
  });
}
