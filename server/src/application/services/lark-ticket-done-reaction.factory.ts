import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../../adapters/postgres/schema.js";
import { LarkClient } from "../../adapters/lark/lark-client.js";
import { PostgresLarkTicketDoneStore } from "../../adapters/postgres/lark-ticket-done-store.js";
import { PostgresPlatformSyncCheckpointStore } from "../../adapters/postgres/platform-sync-checkpoint-store.js";
import { PostgresPlatformSyncLeaseStore } from "../../adapters/postgres/platform-sync-lease-store.js";
import { PostgresPlatformSyncRunStore } from "../../adapters/postgres/platform-sync-run-store.js";
import { larkTicketDoneReactionTaskSchema, type PlatformSyncConfig } from "../../config/platform-sync-config.js";
import { PlatformSyncCoordinator } from "./platform-sync-coordinator.js";
import { createLarkTicketDoneReactionService } from "./lark-ticket-done-reaction.service.js";

export function createLarkTicketDoneReactionRuntime(deps: {
  db: Kysely<DatabaseSchema>; config: PlatformSyncConfig; appId?: string; appSecret?: string;
}) {
  const appId = deps.appId ?? process.env.LARK_APP_ID;
  const appSecret = deps.appSecret ?? process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) throw new Error("LARK_TICKET_DONE_APP_REQUIRED");
  const task = larkTicketDoneReactionTaskSchema.parse(deps.config.scheduler.tasks.larkTicketDoneReaction ?? {});
  return createLarkTicketDoneReactionService({
    ...task, appId, sources: deps.config.larkBase, store: new PostgresLarkTicketDoneStore(deps.db),
    createClient: async (source, actionRunId) => new LarkClient({ appId, appSecret, actionRunId,
      baseUrl: source.larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.feishu.cn" }),
    coordinator: new PlatformSyncCoordinator({ checkpointStore: new PostgresPlatformSyncCheckpointStore(deps.db),
      runStore: new PostgresPlatformSyncRunStore(deps.db), leaseStore: new PostgresPlatformSyncLeaseStore(deps.db),
      leaseDurationMs: deps.config.scheduler.leaseSeconds * 1000 }),
  });
}
