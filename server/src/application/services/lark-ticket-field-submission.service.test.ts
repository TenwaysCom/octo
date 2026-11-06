import { randomUUID } from "node:crypto";
import { createTicketFieldSubmissionService } from "./lark-ticket-field-submission.service.js";
import { PostgresTicketSubmissionStore } from "../../adapters/postgres/lark-ticket-field-submission-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { LarkAPIError } from "../../adapters/lark/lark-client.js";
import { LarkTicketFieldMetadataCache } from "./lark-ticket-field-metadata-cache.js";
import type { TicketFieldChange } from "../../domain/lark-ticket-field-submission.js";

const ref = { masterUserId: "user", larkBaseUrl: "https://open.larksuite.com", baseId: "base", tableId: "table", recordId: "record" };
const priority = { field: "priority", value: "P3", expected: { value: "P1" } } as const;
async function fixture() {
  const { db, pool } = await createTestPostgresDatabase();
  const fields: Record<string, unknown> = { Status: "Open", "紧急度": "P1", "负责人": [{ id: "ou_ada", name: "Ada" }], "Issue 类型": ["Bug"], "Business line": "Retail", "需求人": [] };
  const client = {
    getRecord: vi.fn(async () => ({ record_id: "record", fields: structuredClone(fields) })),
    getFields: vi.fn(async () => [
      { field_id: "f1", field_name: "Status", type: 3 }, { field_id: "f2", field_name: "紧急度", type: 3 },
      { field_id: "f3", field_name: "负责人", type: 11 }, { field_id: "f4", field_name: "Issue 类型", type: 4 },
      { field_id: "f5", field_name: "Business line", type: 3 }, { field_id: "f6", field_name: "需求人", type: 11 },
    ]),
    updateRecord: vi.fn(async (_base: string, _table: string, _id: string, values: Record<string, unknown>) => {
      Object.assign(fields, values); return { record_id: "record", fields: structuredClone(fields) };
    }),
  };
  const store = new PostgresTicketSubmissionStore(db);
  const sync = vi.fn().mockResolvedValue({});
  const deps = { submissionStore: store, createLarkClient: () => client as never, syncLarkBaseTicket: sync,
    fieldMetadataCache: new LarkTicketFieldMetadataCache(), contactStore: { listAvatarsByOpenIds: vi.fn().mockResolvedValue([]) },
    getLarkTokenStore: (() => ({ get: async () => ({ masterUserId: "user", baseUrl: ref.larkBaseUrl, userToken: "synthetic", userTokenExpiresAt: "2099-01-01T00:00:00Z" }) })) as never,
    syncStore: { listLarkBaseTickets: vi.fn().mockResolvedValue([]), getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([]) } };
  const service = createTicketFieldSubmissionService(deps);
  const request = (changes: TicketFieldChange[] = [priority]) => ({ ...ref, expectedUserId: "user", submissionId: randomUUID(), actionRunId: "run", changes });
  return { service, client, fields, sync, store, deps, request, close: async () => { await db.destroy(); await pool.end(); } };
}

describe("Ticket field submission (mock Lark + PostgreSQL adapter)", () => {
  it("writes three properties once, stamps Finish, synchronizes once and durably reuses the result", async () => {
    const f = await fixture();
    try {
      const input = f.request([priority, { field: "status", value: "Finish", expected: { value: "Open" } },
        { field: "responsible", value: "Lin", optionUserId: "ou_lin", expected: { value: "Ada", userIds: ["ou_ada"] } }]);
      const saved = await f.service.submit(input);
      expect(saved).toMatchObject({ state: "saved", larkBaseUpdated: true, values: { responsible: { userIds: ["ou_lin"] } } });
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
      expect(f.client.updateRecord.mock.calls[0][3]).toEqual({ Status: "Finish", "紧急度": "P3", "负责人": [{ id: "ou_lin" }], "关闭时间": expect.any(Number) });
      expect(f.sync).toHaveBeenCalledTimes(1);
      const restarted = createTicketFieldSubmissionService(f.deps);
      expect(await restarted.submit(input)).toEqual(saved);
      expect(await restarted.get(ref, input.submissionId)).toEqual(saved);
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
      expect(f.sync).toHaveBeenCalledTimes(1);
      await expect(restarted.submit({ ...input, changes: [{ ...priority, value: "P2" }] })).rejects.toMatchObject({ code: "TICKET_SUBMISSION_REUSED" });
    } finally { await f.close(); }
  });
  it("rejects a changed field before writing, but ignores concurrent changes to untouched fields", async () => {
    const f = await fixture();
    try {
      f.fields["紧急度"] = "P0";
      const conflict = await f.service.submit(f.request());
      expect(conflict).toMatchObject({ state: "conflict", conflicts: ["priority"], values: { priority: { value: "P0" } } });
      expect(f.client.updateRecord).not.toHaveBeenCalled();
      f.fields.Status = "External";
      await f.service.submit(f.request([{ ...priority, expected: { value: "P0" } }]));
      expect(f.fields.Status).toBe("External");
      expect(f.client.updateRecord.mock.calls[0][3]).toEqual({ "紧急度": "P3" });
    } finally { await f.close(); }
  });
  it("compares people by identity even when names are identical, and suppresses no-op writes", async () => {
    const f = await fixture();
    try {
      expect(await f.service.submit(f.request([{ field: "responsible", value: "Ada", optionUserId: "ou_new", expected: { value: "Ada", userIds: ["ou_other"] } }]))).toMatchObject({ state: "conflict" });
      expect(await f.service.submit(f.request([{ ...priority, value: "P1" }]))).toMatchObject({ state: "saved" });
      expect(f.client.updateRecord).not.toHaveBeenCalled();
      expect(f.sync).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it("keeps known Lark success when sync fails and retries only synchronization", async () => {
    const f = await fixture();
    try {
      f.sync.mockRejectedValueOnce(new Error("synthetic sync failure"));
      const input = f.request();
      expect(await f.service.submit(input)).toMatchObject({ state: "saved_pending_sync", syncFailed: true });
      expect(await f.service.retrySync(ref, input.submissionId)).toMatchObject({ state: "saved", syncFailed: false });
      expect(await f.service.retrySync(ref, input.submissionId)).toMatchObject({ state: "saved" });
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
      expect(f.sync).toHaveBeenCalledTimes(2);
    } finally { await f.close(); }
  });
  it("persists ambiguous writes, blocks subsequent submissions across service instances and never retries a write after readback", async () => {
    const f = await fixture();
    try {
      f.client.updateRecord.mockRejectedValueOnce(new Error("timeout"));
      const input = f.request();
      expect(await f.service.submit(input)).toMatchObject({ state: "unknown" });
      const restarted = createTicketFieldSubmissionService(f.deps);
      await expect(restarted.submit(f.request())).rejects.toMatchObject({ code: "TICKET_SUBMISSION_BUSY" });
      expect(await restarted.reconcile(ref, input.submissionId)).toMatchObject({ state: "unknown" });
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
      f.fields["紧急度"] = "P3";
      expect(await restarted.reconcile(ref, input.submissionId)).toMatchObject({ state: "saved" });
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
      expect(f.sync).toHaveBeenCalledTimes(1);
      await restarted.submit(f.request([{ field: "status", value: "Finish", expected: { value: "Open" } }]));
      expect(f.client.updateRecord).toHaveBeenCalledTimes(2);
    } finally { await f.close(); }
  });
  it("deduplicates concurrent identical submissions and holds the Ticket lock while a write is running", async () => {
    const f = await fixture();
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      f.client.updateRecord.mockImplementationOnce(async () => { await gate; return { record_id: "record", fields: { "紧急度": "P3" } }; });
      const input = f.request();
      const first = f.service.submit(input);
      await vi.waitFor(() => expect(f.client.updateRecord).toHaveBeenCalledTimes(1));
      expect(await f.service.submit(input)).toMatchObject({ state: "writing" });
      await expect(f.service.submit(f.request())).rejects.toMatchObject({ code: "TICKET_SUBMISSION_BUSY" });
      expect(await f.service.reconcile(ref, input.submissionId)).toMatchObject({ state: "writing" });
      release(); await first;
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });
  it.each([403, 1254043, 99991677])("retains specific explicit rejection %s and releases the lock", async (code) => {
    const f = await fixture();
    try {
      f.client.updateRecord.mockRejectedValueOnce(new LarkAPIError("synthetic rejection", code));
      const failed = await f.service.submit(f.request());
      expect(failed.state).toBe("rejected");
      expect(failed.errorCode).toMatch(/SOURCE_FORBIDDEN|SOURCE_NOT_FOUND|AUTH_REQUIRED/);
      expect(await f.service.submit(f.request())).toMatchObject({ state: "saved" });
    } finally { await f.close(); }
  });
  it("scopes every result/recovery/sync operation to the user and full Ticket identity", async () => {
    const f = await fixture();
    try {
      const input = f.request(); await f.service.submit(input);
      for (const method of ["get", "reconcile", "retrySync"] as const) {
        for (const changed of [{ masterUserId: "other" }, { baseId: "other" }, { tableId: "other" }, { recordId: "other" }, { larkBaseUrl: "https://elsewhere.test" }]) {
          await expect(f.service[method]({ ...ref, ...changed }, input.submissionId)).rejects.toMatchObject({ code: "TICKET_SUBMISSION_NOT_FOUND" });
        }
      }
    } finally { await f.close(); }
  });
  it("recovers a persisted writing state after the original process disappeared without sending another update", async () => {
    const f = await fixture();
    try {
      f.client.updateRecord.mockRejectedValueOnce(new Error("lost response"));
      const input = f.request();
      const unknown = await f.service.submit(input);
      await f.store.transition(input.submissionId, ["unknown"], { ...unknown, state: "writing" });
      f.fields["紧急度"] = "P3";
      const restarted = createTicketFieldSubmissionService(f.deps);
      expect(await restarted.reconcile(ref, input.submissionId)).toMatchObject({ state: "saved" });
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
      expect(f.sync).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });
  it("atomically cancels an orphaned preparing claim and fences its delayed writer", async () => {
    const f = await fixture();
    try {
      const input = f.request(), now = new Date().toISOString();
      const pending = { submissionId: input.submissionId, actionRunId: input.actionRunId, state: "preparing" as const,
        layer: "server" as const, module: "lark-ticket-field-submission", stage: "preparing", larkBaseUpdated: false, syncFailed: false };
      await f.store.claim({ submission_id: input.submissionId, master_user_id: ref.masterUserId, base_url: ref.larkBaseUrl,
        base_id: ref.baseId, table_id: ref.tableId, record_id: ref.recordId, request_hash: "synthetic", changes_json: JSON.stringify(input.changes),
        action_run_id: input.actionRunId, state: "preparing", result_json: JSON.stringify(pending),
        active_ticket_key: JSON.stringify([ref.larkBaseUrl, ref.baseId, ref.tableId, ref.recordId]), created_at: now, updated_at: now });
      expect(await f.service.reconcile(ref, input.submissionId)).toMatchObject({ state: "not_applied" });
      expect(await f.store.transition(input.submissionId, ["preparing"], { ...pending, state: "writing" })).toBeUndefined();
      expect(await f.service.submit(f.request())).toMatchObject({ state: "saved" });
      expect(f.client.updateRecord).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });
});
