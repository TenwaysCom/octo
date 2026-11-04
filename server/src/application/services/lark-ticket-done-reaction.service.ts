import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { LarkClient, LarkBitableRecord } from "../../adapters/lark/lark-client.js";
import { isLarkWriteDefinitelyRejected, LarkAPIError } from "../../adapters/lark/lark-client.js";
import type { DoneJob, PostgresLarkTicketDoneStore } from "../../adapters/postgres/lark-ticket-done-store.js";
import type { PlatformSyncConfig } from "../../config/platform-sync-config.js";
import { LARK_TICKET_FIELD_CANDIDATES } from "../../domain/lark-ticket-fields.js";
import { logger } from "../../logger.js";
import { buildLarkTicketCleaningProjection } from "./lark-ticket-cleaning.js";
import { buildLarkUpdatedSinceFilter } from "./platform-sync.service.js";
import type { PlatformSyncCoordinator } from "./platform-sync-coordinator.js";
import { parseLarkThreadId } from "./lark-ticket-thread-context.service.js";

type Source = PlatformSyncConfig["larkBase"][number];
type Client = Pick<LarkClient, "getFields" | "listRecords" | "batchGetRecords" | "getMessage" | "getThreadMessages" | "listMessageReactions" | "createMessageReaction">;
const log = logger.child({ module: "lark-ticket-done-reaction" });
const key = (source: Source) => `${source.baseId}/${source.tableId}`;
const rangeSchema = z.object({ startTime: z.iso.datetime({ offset: true }), endTime: z.iso.datetime({ offset: true }) })
  .refine((value) => Date.parse(value.startTime) < Date.parse(value.endTime), "Invalid time interval");

function causeOf(error: unknown): unknown {
  for (let depth = 0; depth < 8 && error instanceof Error && error.cause; depth++) error = error.cause;
  return error;
}

export function doneReactionErrorCode(error: unknown): string {
  error = causeOf(error);
  if (error instanceof LarkAPIError) return `LARK_TICKET_DONE_API_${error.statusCode ?? "FAILED"}`;
  return error instanceof Error && /^LARK_TICKET_DONE_[A-Z_]+$/.test(error.message) ? error.message : "LARK_TICKET_DONE_FAILED";
}

export async function resolveDoneRoot(client: Pick<Client, "getMessage" | "getThreadMessages">, messageLink: string) {
  let link: URL;
  try { link = new URL(messageLink); } catch { throw new Error("LARK_TICKET_DONE_LINK_INVALID"); }
  const thread = parseLarkThreadId(messageLink);
  if (link.protocol !== "https:" || !["applink.larksuite.com", "applink.feishu.cn"].includes(link.hostname)
    || link.pathname !== "/client/thread/open" || !thread) throw new Error("LARK_TICKET_DONE_LINK_INVALID");
  let rootId = link.searchParams.get("messageid") ?? undefined;
  let canonical = thread;
  if (!rootId || /^\d+$/.test(thread)) {
    const page = await client.getThreadMessages(thread, { pageSize: 1, sortType: "ByCreateTimeAsc" });
    const reply = page.items[0];
    const derivedRoot = reply?.root_id ?? (reply && !reply.parent_id ? reply.message_id : undefined);
    if (!derivedRoot || !reply?.thread_id || (rootId && derivedRoot !== rootId)) throw new Error("LARK_TICKET_DONE_ROOT_REQUIRED");
    rootId = derivedRoot;
    canonical = reply.thread_id;
  }
  if (!/^om_[A-Za-z0-9]+$/.test(rootId)) throw new Error("LARK_TICKET_DONE_ROOT_REQUIRED");
  const root = await client.getMessage(rootId);
  const chat = link.searchParams.get("openchatid") ?? link.searchParams.get("open_chat_id") ?? link.searchParams.get("chatid");
  if (root.message_id !== rootId || root.deleted || !root.chat_id || root.thread_id !== canonical
    || (root.root_id && root.root_id !== rootId) || (root.parent_id && root.parent_id !== rootId)
    || (chat?.startsWith("oc_") && root.chat_id !== chat)) throw new Error("LARK_TICKET_DONE_ROOT_INVALID");
  return root.message_id;
}

export function createLarkTicketDoneReactionService(deps: {
  store: Pick<PostgresLarkTicketDoneStore, "initializeScan" | "advanceScan" | "enqueue" | "listPending" | "save" | "hasUncertainReaction">;
  coordinator: Pick<PlatformSyncCoordinator, "runExclusive">;
  createClient: (source: Source, actionRunId: string) => Promise<Client>;
  sources: Source[];
  appId: string;
  targetStatus: string;
  intervalMinutes: number;
  overlapMinutes: number;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const sourceFor = (baseId: string, tableId: string) => {
    const source = deps.sources.find((item) => item.baseId === baseId && item.tableId === tableId);
    if (!source) throw new Error("LARK_TICKET_DONE_SOURCE_REQUIRED");
    return source;
  };

  async function statusField(client: Client, source: Source) {
    const fields = await client.getFields(source.baseId, source.tableId);
    const status = (source.statusFieldName ? [source.statusFieldName] : LARK_TICKET_FIELD_CANDIDATES.status)
      .find((name) => fields.some((field) => field.field_name === name));
    if (!status || /[\[\]]/.test(status) || !fields.some((field) => field.field_name === source.sourceUpdatedAtFieldName)) {
      throw new Error("LARK_TICKET_DONE_FIELDS_REQUIRED");
    }
    return status;
  }

  function statusMatches(record: LarkBitableRecord, field: string) {
    return record.fields[field] === deps.targetStatus;
  }

  async function readRecord(client: Client, source: Source, recordId: string) {
    const page = await client.batchGetRecords(source.baseId, source.tableId, [recordId], { automaticFields: true });
    if (page.forbidden_record_ids.length || page.absent_record_ids.length || page.records.length !== 1 || page.records[0]?.record_id !== recordId) {
      throw new Error("LARK_TICKET_DONE_RECORD_UNAVAILABLE");
    }
    return page.records[0];
  }

  async function discover(source: Source, startTime: string, endTime: string, actionRunId: string) {
    const range = rangeSchema.parse({ startTime, endTime });
    const client = await deps.createClient(source, actionRunId);
    const status = await statusField(client, source);
    const updated = buildLarkUpdatedSinceFilter(source.sourceUpdatedAtFieldName, Date.parse(range.startTime));
    // Lark TODATE filters discard the time of day; enforce the exact window below.
    const filter = `AND(${updated},CurrentValue.[${status}] = ${JSON.stringify(deps.targetStatus)})`;
    const records: LarkBitableRecord[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const page = await client.listRecords(source.baseId, source.tableId, { filter, pageSize: 500, pageToken, automaticFields: true });
      for (const record of page.records) {
        const timestamp = Date.parse(record.updated_time ?? "");
        if (!Number.isFinite(timestamp)) throw new Error("LARK_TICKET_DONE_SOURCE_TIME_REQUIRED");
        if (timestamp >= Date.parse(range.startTime) && timestamp < Date.parse(range.endTime) && statusMatches(record, status)) records.push(record);
      }
      if (!page.hasMore) break;
      if (!page.nextPageToken || seen.has(page.nextPageToken)) throw new Error("LARK_TICKET_DONE_PAGINATION_INVALID");
      seen.add(page.nextPageToken);
      pageToken = page.nextPageToken;
    } while (true);
    return records;
  }

  async function ownReaction(client: Client, rootId: string) {
    let pageToken: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.listMessageReactions(rootId, { emojiType: "DONE", pageToken });
      const own = page.items.find((item) => item.reaction_id && item.operator?.operator_type === "app"
        && item.operator.operator_id === deps.appId && item.reaction_type?.emoji_type === "DONE");
      if (own) return own.reaction_id;
      if (!page.hasMore) return undefined;
      if (!page.pageToken || seen.has(page.pageToken)) throw new Error("LARK_TICKET_DONE_PAGINATION_INVALID");
      seen.add(page.pageToken);
      pageToken = page.pageToken;
    } while (true);
  }

  async function processOne(source: Source, initial: DoneJob, parentActionRunId: string) {
    let job = initial;
    const result = () => ({ recordId: job.record_id, status: job.stage, actionRunId: job.action_run_id,
      layer: "server" as const, module: "lark-ticket-done-reaction", stage: `server.ticket_done.${job.stage}`,
      errorCode: job.error_code ?? undefined });
    const enteredUnknown = ["adding", "outcome_unknown"].includes(job.stage);
    let writeDefinitelyRejected = false;
    if (["done", "cancelled"].includes(job.stage)) return result();
    try {
      const client = await deps.createClient(source, job.action_run_id);
      const uncertain = enteredUnknown;
      let rootId = job.root_message_id;
      if (!uncertain) {
        const field = await statusField(client, source);
        const record = await readRecord(client, source, job.record_id);
        if (!statusMatches(record, field) || buildLarkTicketCleaningProjection(record.fields).larkMessageLink !== job.message_link) {
          job = await deps.store.save(job, "cancelled");
          return result();
        }
        rootId = await resolveDoneRoot(client, job.message_link);
      }
      if (!rootId) throw new Error("LARK_TICKET_DONE_ROOT_REQUIRED");
      const lockedRoot = rootId;
      await deps.coordinator.runExclusive({
        platform: "lark", scopeKey: `done-message:${deps.appId}/${lockedRoot}`, mode: "full", cleanAfterSync: false,
        trigger: "retry", actionRunId: job.action_run_id,
        execute: async () => {
          try {
            let reactionId = await ownReaction(client, lockedRoot);
            if (!reactionId && !uncertain) {
              if (await deps.store.hasUncertainReaction(deps.appId, lockedRoot, job.job_id)) {
                throw new Error("LARK_TICKET_DONE_REACTION_PENDING");
              }
              // Persist before dispatch. Recovery of this stage can only reconcile.
              job = await deps.store.save(job, "adding", { root_message_id: lockedRoot });
              try { await client.createMessageReaction(lockedRoot, "DONE"); }
              catch (error) { writeDefinitelyRejected = isLarkWriteDefinitelyRejected(error); throw error; }
              reactionId = await ownReaction(client, lockedRoot);
            }
            if (!reactionId) throw new Error("LARK_TICKET_DONE_WRITE_UNKNOWN");
            job = await deps.store.save(job, "done", { root_message_id: lockedRoot, reaction_id: reactionId });
            return { listed: 1, synced: 1, skippedInactive: 0 };
          } catch (error) {
            throw new Error(doneReactionErrorCode(error), { cause: error });
          }
        },
      });
      log.info({ actionRunId: job.action_run_id, parentActionRunId, layer: "server", stage: "server.ticket_done.done",
        sourceKey: key(source), recordId: job.record_id, reactionId: job.reaction_id }, "LARK_TICKET_DONE_CONFIRMED");
    } catch (error) {
      const errorCode = doneReactionErrorCode(error);
      const cause = causeOf(error);
      const writeUncertain = (enteredUnknown || job.stage === "adding") && !writeDefinitelyRejected;
      const permanent = (cause instanceof LarkAPIError && [400, 403, 404, 422].includes(cause.statusCode ?? 0))
        || ["LARK_TICKET_DONE_LINK_INVALID", "LARK_TICKET_DONE_ROOT_REQUIRED", "LARK_TICKET_DONE_ROOT_INVALID", "LARK_TICKET_DONE_RECORD_UNAVAILABLE"].includes(errorCode);
      job = await deps.store.save(job, writeUncertain ? "outcome_unknown" : permanent ? "blocked" : "pending", {
        error_code: errorCode, attempts: job.attempts + 1,
        next_retry_at: new Date(now().getTime() + Math.min(60, 2 ** job.attempts) * 60_000).toISOString(),
      });
      log.warn({ actionRunId: job.action_run_id, parentActionRunId, layer: "server", stage: "server.ticket_done.process", errorCode,
        sourceKey: key(source), recordId: job.record_id }, "LARK_TICKET_DONE_ITEM_FAILED");
    }
    return result();
  }

  async function enqueue(source: Source, record: LarkBitableRecord) {
    if (!record.updated_time || !Number.isFinite(Date.parse(record.updated_time))) throw new Error("LARK_TICKET_DONE_SOURCE_TIME_REQUIRED");
    return deps.store.enqueue({ sourceKey: key(source), appId: deps.appId, recordId: record.record_id,
      sourceUpdatedAt: record.updated_time, messageLink: buildLarkTicketCleaningProjection(record.fields).larkMessageLink ?? "" });
  }

  async function exclusive<T>(source: Source, trigger: "manual" | "scheduled", execute: (actionRunId: string) => Promise<T>, actionRunId = randomUUID()) {
    const result = await deps.coordinator.runExclusive({ platform: "lark", scopeKey: `done-reactions:${key(source)}`,
      mode: "full", cleanAfterSync: false, trigger, actionRunId,
      execute: async (context) => {
        try { return { listed: 0, synced: 0, skippedInactive: 0, value: await execute(context.actionRunId) }; }
        catch (error) { throw new Error(doneReactionErrorCode(error), { cause: error }); }
      },
    });
    return result.value;
  }

  return {
    async preview(input: { baseId: string; tableId: string; startTime: string; endTime: string }) {
      const source = sourceFor(input.baseId, input.tableId);
      return (await discover(source, input.startTime, input.endTime, randomUUID())).map((record) => ({ recordId: record.record_id, sourceUpdatedAt: record.updated_time }));
    },
    async processRecord(baseId: string, tableId: string, recordId: string) {
      const source = sourceFor(baseId, tableId);
      return exclusive(source, "manual", async (actionRunId) => {
        const client = await deps.createClient(source, actionRunId);
        const record = await readRecord(client, source, recordId);
        if (!statusMatches(record, await statusField(client, source))) return { recordId, status: "cancelled", actionRunId,
          layer: "server" as const, module: "lark-ticket-done-reaction", stage: "server.ticket_done.cancelled" };
        return processOne(source, await enqueue(source, record), actionRunId);
      });
    },
    async previewRecord(baseId: string, tableId: string, recordId: string) {
      const source = sourceFor(baseId, tableId);
      const client = await deps.createClient(source, randomUUID());
      const record = await readRecord(client, source, recordId);
      return { recordId, matchesStatus: statusMatches(record, await statusField(client, source)) };
    },
    async runOnce(signal?: AbortSignal) {
      for (const source of deps.sources) {
        if (signal?.aborted) break;
        const actionRunId = randomUUID();
        try {
          await exclusive(source, "scheduled", async (actionRunId) => {
            const end = now().toISOString();
            const cursor = await deps.store.initializeScan(key(source), end);
            const start = new Date(Math.max(Date.parse(cursor.enabled_at), Date.parse(cursor.watermark) - deps.overlapMinutes * 60_000)).toISOString();
            if (start < end) {
              const records = await discover(source, start, end, actionRunId);
              for (const record of records) await enqueue(source, record);
              await deps.store.advanceScan(key(source), end);
            }
            const jobs = await deps.store.listPending(key(source), deps.appId, now().toISOString());
            let failed = false;
            for (const job of jobs) {
              if (signal?.aborted) break;
              const result = await processOne(source, job, actionRunId);
              if (!["done", "cancelled"].includes(result.status)) failed = true;
            }
            if (failed) throw new Error("LARK_TICKET_DONE_PARTIAL_FAILURE");
          }, actionRunId);
        } catch (error) {
          log.warn({ actionRunId, layer: "server", stage: "server.ticket_done.scan", sourceKey: key(source), errorCode: doneReactionErrorCode(error) }, "LARK_TICKET_DONE_SCAN_FAILED");
        }
      }
    },
    async run(signal: AbortSignal) {
      while (!signal.aborted) {
        await this.runOnce(signal);
        if (signal.aborted) break;
        await new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
          const timer = setTimeout(finish, deps.intervalMinutes * 60_000);
          signal.addEventListener("abort", finish, { once: true });
        });
      }
    },
  };
}
