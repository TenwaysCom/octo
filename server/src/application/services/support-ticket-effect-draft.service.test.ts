import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  SupportTicketEffectDraftRecord,
  SupportTicketEffectDraftStore,
} from "../../adapters/postgres/support-ticket-effect-draft-store.js";
import { createSupportTicketEffectDraftService } from "./support-ticket-effect-draft.service.js";
import { ensureAcpKimiScratchDir } from "./acp-kimi-permission-policy.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };

describe("support ticket effect draft service", () => {
  it("ingests one action-scoped draft and removes its 0700 scratch directory", async () => {
    const store = memoryStore();
    const actionRunId = `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const scratchDir = await ensureAcpKimiScratchDir(actionRunId);
    const payload = {
      version: "support-qa-ticket-ai-draft-v1",
      effectType: "ticket_ai_update",
      ...ticket,
      ticketNumber: "TEN-10",
      snapshotVersion: 2,
      actionRunId,
      fields: { "AI分析状态": "已分析" },
      indexEntry: { record_id: ticket.recordId },
    };
    try {
      expect((await stat(scratchDir)).mode & 0o777).toBe(0o700);
      await writeFile(join(scratchDir, "effect-draft.json"), JSON.stringify(payload), { mode: 0o600 });
      const service = createSupportTicketEffectDraftService({ draftStore: store });
      await expect(service.ingestFromScratch({
        operatorLarkId: "ou_1",
        sessionId: "session_1",
        actionKey: "lark-ticket-support-qa-document-preview",
        permissionProfileId: "support-qa.document.v1",
        actionRunId,
        ticket,
        snapshotVersion: 2,
      })).resolves.toMatchObject({ status: "pending", actionRunId });
      await expect(access(scratchDir)).rejects.toBeDefined();
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  });

  it("confirms Ticket AI once, updates the index afterward, and makes repeated confirmation idempotent", async () => {
    const workspace = await createWorkspace();
    const store = memoryStore();
    const writer = { update: vi.fn().mockResolvedValue({ readBackVerified: true }) };
    const draft = await seedTicketAiDraft(store);
    const service = createService({ store, workspace, writer });
    try {
      await expect(service.confirm(confirmInput(draft.id))).resolves.toMatchObject({ status: "completed" });
      await expect(service.confirm(confirmInput(draft.id))).resolves.toMatchObject({ status: "completed" });
      expect(writer.update).toHaveBeenCalledTimes(1);
      expect(await readFile(join(workspace, "docs/support-qa/knowledge-index.jsonl"), "utf8")).toContain('"record_id":"rec_1"');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resumes only the index stage after Ticket AI succeeded", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "octo-effect-recovery-"));
    const store = memoryStore();
    const writer = { update: vi.fn().mockResolvedValue({ readBackVerified: true }) };
    const draft = await seedTicketAiDraft(store);
    const service = createService({ store, workspace, writer });
    await expect(service.confirm(confirmInput(draft.id))).rejects.toMatchObject({ code: "EFFECT_INDEX_UPDATE_FAILED" });
    expect((await store.get(draft.id))?.status).toBe("ticket_ai_written");
    await mkdir(join(workspace, "docs/support-qa"), { recursive: true });
    await writeFile(join(workspace, "docs/support-qa/knowledge-index.jsonl"), "");
    await expect(service.confirm(confirmInput(draft.id))).resolves.toMatchObject({ status: "completed" });
    expect(writer.update).toHaveBeenCalledTimes(1);
    await rm(workspace, { recursive: true, force: true });
  });

  it("rejects an expired snapshot before any write", async () => {
    const workspace = await createWorkspace();
    const store = memoryStore();
    const writer = { update: vi.fn() };
    const draft = await seedTicketAiDraft(store);
    const service = createService({ store, workspace, writer, snapshotVersion: 3 });
    await expect(service.confirm(confirmInput(draft.id))).rejects.toMatchObject({ code: "EFFECT_DRAFT_SNAPSHOT_CONFLICT" });
    expect(writer.update).not.toHaveBeenCalled();
    await rm(workspace, { recursive: true, force: true });
  });

  it("writes Answer feedback only after schema validation and verifies it by readback", async () => {
    const store = memoryStore();
    const draft = await seedFeedbackDraft(store);
    const larkClient = {
      getFields: vi.fn().mockResolvedValue(["ticket编号", "问题总结", "答案总结", "错误分类", "错误说明"].map((field_name) => ({ field_name }))),
      createRecord: vi.fn().mockResolvedValue({ record_id: "rec_feedback_1", fields: {} }),
      getRecord: vi.fn().mockResolvedValue({ record_id: "rec_feedback_1", fields: {} }),
    };
    const service = createService({ store, workspace: null, actionKey: "lark-ticket-support-qa-answer", profileId: "support-qa.answer.v1", buildLarkClient: vi.fn().mockResolvedValue({ client: larkClient }) });
    await expect(service.confirm(confirmInput(draft.id))).resolves.toMatchObject({ status: "completed", externalRef: "rec_feedback_1" });
    expect(larkClient.createRecord).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      "ticket编号": "TEN-10",
      "问题总结": "问题",
      "答案总结": "答案",
      "错误说明": "",
    });
    expect(larkClient.getRecord).toHaveBeenCalledWith(expect.any(String), expect.any(String), "rec_feedback_1");
  });

  it("marks an uncertain feedback write and blocks automatic retry", async () => {
    const store = memoryStore();
    const draft = await seedFeedbackDraft(store);
    const createRecord = vi.fn().mockRejectedValue(new Error("connection reset"));
    const larkClient = {
      getFields: vi.fn().mockResolvedValue(["ticket编号", "问题总结", "答案总结", "错误分类", "错误说明"].map((field_name) => ({ field_name }))),
      createRecord,
      getRecord: vi.fn(),
    };
    const service = createService({ store, workspace: null, actionKey: "lark-ticket-support-qa-answer", profileId: "support-qa.answer.v1", buildLarkClient: vi.fn().mockResolvedValue({ client: larkClient }) });
    await expect(service.confirm(confirmInput(draft.id))).rejects.toMatchObject({ code: "EXTERNAL_WRITE_OUTCOME_UNKNOWN" });
    await expect(service.confirm(confirmInput(draft.id))).rejects.toMatchObject({ code: "EXTERNAL_WRITE_OUTCOME_UNKNOWN" });
    expect(createRecord).toHaveBeenCalledTimes(1);
  });
});

function createService(input: {
  store: SupportTicketEffectDraftStore;
  workspace: string | null;
  writer?: { update: ReturnType<typeof vi.fn> };
  snapshotVersion?: number;
  actionKey?: string;
  profileId?: string;
  buildLarkClient?: ReturnType<typeof vi.fn>;
}) {
  return createSupportTicketEffectDraftService({
    draftStore: input.store,
    ownershipStore: { getBySessionId: vi.fn().mockResolvedValue({
      sessionId: "session_1",
      operatorLarkId: "ou_1",
      actionRunId: "action_1",
      automationActionKey: input.actionKey ?? "lark-ticket-support-qa-document-preview",
      permissionProfileId: input.profileId ?? "support-qa.document.v1",
      kimiWorkDir: input.workspace,
    }) } as never,
    threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: input.snapshotVersion ?? 2 }) },
    ticketAiWriter: input.writer ?? { update: vi.fn() },
    buildLarkClient: input.buildLarkClient as never,
  });
}

function confirmInput(draftId: string) {
  return { operatorLarkId: "ou_1", masterUserId: "user_1", larkBaseUrl: "https://open.larksuite.com", draftId, actionRunId: "action_1", confirmed: true as const, ticket };
}

async function seedTicketAiDraft(store: SupportTicketEffectDraftStore) {
  const payload = JSON.stringify({
    version: "support-qa-ticket-ai-draft-v1",
    effectType: "ticket_ai_update",
    ...ticket,
    ticketNumber: "TEN-10",
    snapshotVersion: 2,
    actionRunId: "action_1",
    fields: { "AI分析状态": "已分析" },
    indexEntry: { record_id: "rec_1" },
  });
  return store.create(baseDraft("ticket_ai_update", payload, "support-qa.document.v1"));
}

async function seedFeedbackDraft(store: SupportTicketEffectDraftStore) {
  const payload = JSON.stringify({
    version: "support-qa-answer-feedback-draft-v1",
    effectType: "answer_feedback",
    ...ticket,
    ticketNumber: "TEN-10",
    snapshotVersion: 2,
    actionRunId: "action_1",
    feedback: { correct: true, issueSummary: "问题", answerSummary: "答案", errorCategories: [], errorExplanation: "" },
  });
  return store.create(baseDraft("answer_feedback", payload, "support-qa.answer.v1"));
}

function baseDraft(effectType: "answer_feedback" | "ticket_ai_update", payloadJson: string, permissionProfileId: string) {
  return {
    id: `draft_${effectType}`,
    effectType,
    ...ticket,
    sessionId: "session_1",
    operatorLarkId: "ou_1",
    actionRunId: "action_1",
    permissionProfileId,
    snapshotVersion: 2,
    payloadJson,
    payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
  };
}

async function createWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "octo-effect-workspace-"));
  await mkdir(join(workspace, "docs/support-qa"), { recursive: true });
  await writeFile(join(workspace, "docs/support-qa/knowledge-index.jsonl"), "");
  return workspace;
}

function memoryStore(): SupportTicketEffectDraftStore {
  const records = new Map<string, SupportTicketEffectDraftRecord>();
  return {
    async create(input) {
      const now = new Date().toISOString();
      const record = { ...input, status: "pending" as const, externalRef: null, errorCode: null, errorMessage: null, createdAt: now, updatedAt: now };
      records.set(record.id, record);
      return record;
    },
    async get(id) { return records.get(id); },
    async list(input) { return [...records.values()].filter((record) => record.operatorLarkId === input.operatorLarkId && record.baseId === input.baseId && record.tableId === input.tableId && record.recordId === input.recordId); },
    async transition(input) {
      const current = records.get(input.id);
      if (!current || !input.from.includes(current.status)) return undefined;
      const next = {
        ...current,
        status: input.to,
        externalRef: input.externalRef ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        updatedAt: new Date().toISOString(),
      };
      records.set(input.id, next);
      return next;
    },
  };
}
