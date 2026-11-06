import { createHash } from "node:crypto";
import { z } from "zod";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";
import { buildFieldValue, buildUpdatedTicketProjection, findFieldByName, type LarkTicketFieldUpdateDeps } from "./lark-ticket-field-update.service.js";
import { larkTicketFieldMetadataCache } from "./lark-ticket-field-metadata-cache.js";
import { resolveLarkTicketPeople } from "./lark-ticket-people.service.js";
import { PlatformSyncService } from "./platform-sync.service.js";
import { LarkTicketError, toLarkTicketSourceError } from "./lark-ticket.service.js";
import { LARK_TICKET_CLOSED_AT_FIELD, LARK_TICKET_FIELD_CANDIDATES } from "../../domain/lark-ticket-fields.js";
import { editableTicketFields, isPersonField, sameTicketFieldValue, ticketFieldKeys, ticketFieldSubmissionSchema,
  type TicketFieldChange, type TicketFieldValues, type TicketSubmissionResult, type TicketSubmissionState } from "../../domain/lark-ticket-field-submission.js";
import { isLarkWriteDefinitelyRejected, type LarkBitableRecord } from "../../adapters/lark/lark-client.js";
import { PostgresTicketSubmissionStore, type TicketSubmissionRow, type TicketSubmissionStore } from "../../adapters/postgres/lark-ticket-field-submission-store.js";
import { PostgresPlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { logger } from "../../logger.js";

const MODULE = "lark-ticket-field-submission";
type Reference = { masterUserId: string; larkBaseUrl: string; baseId: string; tableId: string; recordId: string };
type Submit = Reference & z.infer<typeof ticketFieldSubmissionSchema>;
type Deps = LarkTicketFieldUpdateDeps & { submissionStore?: TicketSubmissionStore };
const running = new Set<string>();
const syncing = new Map<string, Promise<TicketSubmissionResult>>();

export class TicketSubmissionError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 409) { super(message); }
}
function result(id: string, actionRunId: string, state: TicketSubmissionState, extra: Partial<TicketSubmissionResult> = {}): TicketSubmissionResult {
  return { submissionId: id, actionRunId, state, layer: "server", module: MODULE, stage: `server.ticket-fields.${state}`,
    larkBaseUpdated: state === "saved" || state === "saved_pending_sync", syncFailed: state === "saved_pending_sync", ...extra };
}
function readResult(row: TicketSubmissionRow): TicketSubmissionResult { return JSON.parse(row.result_json); }
function desired(change: TicketFieldChange) { return { value: change.value, ...(isPersonField(change.field) ? { userIds: [change.optionUserId!] } : {}) }; }
function sourceError(error: unknown) {
  const typed = toLarkTicketSourceError(error) ?? (error instanceof LarkTicketError || error instanceof TicketSubmissionError ? error : undefined);
  return { errorCode: typed?.code ?? "LARK_TICKET_FIELD_UPDATE_FAILED", errorMessage: typed?.message ?? "Ticket 保存失败，请重新核对后重试。" };
}

export function createTicketFieldSubmissionService(deps: Deps = {}) {
  const store = deps.submissionStore ?? new PostgresTicketSubmissionStore();
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();
  async function projection(ref: Reference, record: LarkBitableRecord) {
    const ticket = buildUpdatedTicketProjection(ref.baseId, ref.tableId, ref.recordId, record.fields);
    Object.assign(ticket, (await resolveLarkTicketPeople([record.fields], deps))[0]);
    const values = Object.fromEntries(editableTicketFields.map((field) => {
      const raw = LARK_TICKET_FIELD_CANDIDATES[field].map((name) => record.fields[name]).find((value) => value != null);
      const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return [field, { value: ticket[ticketFieldKeys[field]] ?? "", ...(isPersonField(field) ? {
        userIds: entries.flatMap((entry) => typeof entry === "object" && entry && "id" in entry && typeof entry.id === "string" ? [entry.id] : []),
      } : {}) }];
    })) as TicketFieldValues;
    return { ticket: { ...ticket }, values };
  }
  async function clientFor(ref: Reference, actionRunId?: string) { return (await buildAuthenticatedLarkClient(ref.masterUserId, ref.larkBaseUrl, { ...deps, actionRunId })).client; }
  async function ensureNotDeleted(ref: Reference) {
    const [snapshot] = await getSyncStore().getLarkBaseTicketsForCleaning?.([ref]) ?? [];
    if (snapshot?.deletedAt) throw new LarkTicketError("LARK_TICKET_DELETED", "此 Ticket 已在 Octo 标记删除。", 409);
  }
  async function scoped(ref: Reference, id: string) {
    const row = await store.get(id);
    if (!row || row.master_user_id !== ref.masterUserId || row.base_url !== ref.larkBaseUrl
      || row.base_id !== ref.baseId || row.table_id !== ref.tableId || row.record_id !== ref.recordId) {
      throw new TicketSubmissionError("TICKET_SUBMISSION_NOT_FOUND", "未找到此账号和 Ticket 的提交记录。", 404);
    }
    return row;
  }
  async function save(row: TicketSubmissionRow, states: TicketSubmissionState[], next: TicketSubmissionResult) {
    const updated = await store.transition(row.submission_id, states, next);
    return readResult(updated ?? await store.get(row.submission_id) ?? row);
  }
  async function sync(ref: Reference, row: TicketSubmissionRow): Promise<TicketSubmissionResult> {
    const old = readResult(row);
    if (!["saved_pending_sync", "saved"].includes(row.state)) return old;
    if (row.state === "saved") return old;
    const active = syncing.get(row.submission_id);
    if (active) return active;
    const completion = (async () => {
      try {
        const client = await clientFor(ref, row.action_run_id);
        await (deps.syncLarkBaseTicket ?? ((input) => new PlatformSyncService({ createLarkClient: async () => client }).syncLarkBaseTicket(input)))({
          ...ref, actionRunId: row.action_run_id, cleanAfterSync: true,
        });
        return await save(row, ["saved_pending_sync"], result(row.submission_id, row.action_run_id, "saved", { ticket: old.ticket, values: old.values }));
      } catch {
        logger.warn({ actionRunId: row.action_run_id, layer: "server", module: MODULE, stage: "server.ticket-fields.sync", errorCode: "LARK_TICKET_SYNC_FAILED" }, "ticket-fields.sync_failed");
        return old;
      }
    })();
    syncing.set(row.submission_id, completion);
    try { return await completion; } finally { syncing.delete(row.submission_id); }
  }
  return {
    async snapshot(ref: Reference) {
      await ensureNotDeleted(ref);
      const record = await (await clientFor(ref)).getRecord(ref.baseId, ref.tableId, ref.recordId);
      return projection(ref, record);
    },
    async get(ref: Reference, id: string) { return readResult(await scoped(ref, id)); },
    async retrySync(ref: Reference, id: string) { return sync(ref, await scoped(ref, id)); },
    async reconcile(ref: Reference, id: string) {
      const row = await scoped(ref, id);
      if (["saved", "saved_pending_sync"].includes(row.state)) return sync(ref, row);
      if (!["preparing", "writing", "unknown"].includes(row.state)) return readResult(row);
      // A pre-write claim can be cancelled atomically. The writer must CAS to writing before touching Lark.
      if (row.state === "preparing" && !running.has(id)) return save(row, ["preparing"], result(id, row.action_run_id, "not_applied"));
      const record = await (await clientFor(ref, row.action_run_id)).getRecord(ref.baseId, ref.tableId, ref.recordId);
      const fresh = await projection(ref, record);
      if (running.has(id)) return { ...readResult(row), ...fresh };
      const changes: TicketFieldChange[] = JSON.parse(row.changes_json);
      if (!changes.every((change) => sameTicketFieldValue(change.field, fresh.values[change.field], desired(change)))) {
        return save(row, ["writing", "unknown"], result(id, row.action_run_id, "unknown", { ...fresh,
          errorCode: "TICKET_OUTCOME_UNKNOWN", errorMessage: "尚不能确认此提交结果，已暂停后续发送；可继续整理草稿并重新核对。" }));
      }
      await save(row, ["writing", "unknown"], result(id, row.action_run_id, "saved_pending_sync", fresh));
      return sync(ref, await scoped(ref, id));
    },
    async submit(input: Submit): Promise<TicketSubmissionResult> {
      const changes = [...input.changes].sort((a, b) => a.field.localeCompare(b.field));
      const hash = createHash("sha256").update(JSON.stringify(changes)).digest("hex");
      const initial = result(input.submissionId, input.actionRunId, "preparing");
      const now = new Date().toISOString();
      const claim = await store.claim({ submission_id: input.submissionId, master_user_id: input.masterUserId, base_url: input.larkBaseUrl,
        base_id: input.baseId, table_id: input.tableId, record_id: input.recordId, request_hash: hash, changes_json: JSON.stringify(changes),
        action_run_id: input.actionRunId, state: "preparing", result_json: JSON.stringify(initial),
        active_ticket_key: JSON.stringify([input.larkBaseUrl, input.baseId, input.tableId, input.recordId]), created_at: now, updated_at: now });
      if (!claim.row) throw new TicketSubmissionError("TICKET_SUBMISSION_BUSY", "此 Ticket 有另一笔未确认的提交，请稍后重新核对。");
      const row = await scoped(input, input.submissionId);
      if (row.request_hash !== hash) throw new TicketSubmissionError("TICKET_SUBMISSION_REUSED", "同一提交编号不能用于不同修改。");
      if (!claim.created) return readResult(row);
      running.add(row.submission_id);
      const startedAt = Date.now();
      let writing = false;
      let larkSaved = false;
      try {
        await ensureNotDeleted(input);
        const client = await clientFor(input, row.action_run_id);
        // Fresh source data, never the Octo snapshot, establishes field-level optimistic concurrency.
        const record = await client.getRecord(input.baseId, input.tableId, input.recordId);
        const fresh = await projection(input, record);
        const conflicts = changes.filter((change) => !sameTicketFieldValue(change.field, fresh.values[change.field], change.expected)).map((change) => change.field);
        if (conflicts.length) return await save(row, ["preparing"], result(row.submission_id, row.action_run_id, "conflict", { ...fresh, conflicts,
          errorCode: "TICKET_FIELD_CONFLICT", errorMessage: "这些属性已被其他人修改，请选择保留草稿或采用最新值。" }));
        const actual = changes.filter((change) => !sameTicketFieldValue(change.field, fresh.values[change.field], desired(change)));
        if (!actual.length) return await save(row, ["preparing"], result(row.submission_id, row.action_run_id, "saved", fresh));
        const cache = deps.fieldMetadataCache ?? larkTicketFieldMetadataCache;
        const cacheKey = JSON.stringify([input.larkBaseUrl, input.masterUserId, input.baseId, input.tableId]);
        const metadata = await cache.get(cacheKey, () => client.getFields(input.baseId, input.tableId));
        const fields: Record<string, unknown> = {};
        for (const change of actual) {
          const meta = findFieldByName(metadata, change.field);
          if (!meta) { cache.invalidate(cacheKey); throw new TicketSubmissionError("LARK_TICKET_FIELD_NOT_FOUND", `Ticket 表中未找到 ${change.field} 对应的字段。`, 404); }
          if (isPersonField(change.field) && meta.type !== 11 && meta.ui_type !== "User") throw new TicketSubmissionError("TICKET_FIELD_TYPE_CHANGED", "人员字段类型已变化，请核对 Lark 表配置。");
          if (meta.options && !meta.options.some((option) => option.name === change.value)) throw new TicketSubmissionError("TICKET_OPTION_NOT_FOUND", "所选属性选项已变化，请重新加载选项。");
          fields[meta.field_name] = buildFieldValue(change.field, meta, change.value, change.optionUserId);
          if (change.field === "status" && change.value === "Finish") fields[LARK_TICKET_CLOSED_AT_FIELD] = Date.now();
        }
        const claimed = await store.transition(row.submission_id, ["preparing"], result(row.submission_id, row.action_run_id, "writing"));
        if (!claimed) return readResult((await store.get(row.submission_id))!);
        writing = true;
        let updated: LarkBitableRecord;
        try { updated = await client.updateRecord(input.baseId, input.tableId, input.recordId, fields); }
        catch (error) { cache.invalidate(cacheKey); throw error; }
        larkSaved = true;
        const saved = await projection(input, { ...record, fields: { ...record.fields, ...fields, ...updated.fields } });
        // Persist the known Lark success before attempting local synchronization.
        await save(row, ["writing"], result(row.submission_id, row.action_run_id, "saved_pending_sync", saved));
        return await sync(input, await scoped(input, row.submission_id));
      } catch (error) {
        const state = larkSaved ? "saved_pending_sync" : writing && !isLarkWriteDefinitelyRejected(error) && !toLarkTicketSourceError(error) ? "unknown" : "rejected";
        const detail = state === "unknown" ? { errorCode: "TICKET_OUTCOME_UNKNOWN", errorMessage: "请求结果未知，已暂停该 Ticket 后续发送，请重新核对。" } : sourceError(error);
        logger.warn({ actionRunId: row.action_run_id, layer: "server", module: MODULE, stage: `server.ticket-fields.${state}`, errorCode: detail.errorCode }, "ticket-fields.failed");
        return await save(row, ["preparing", "writing"], result(row.submission_id, row.action_run_id, state, detail));
      } finally {
        running.delete(row.submission_id);
        logger.info({ actionRunId: row.action_run_id, layer: "server", module: MODULE, stage: "server.ticket-fields.completed",
          submissionId: row.submission_id, fieldCount: changes.length, elapsedMs: Date.now() - startedAt }, "ticket-fields.completed");
      }
    },
  };
}
