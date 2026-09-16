import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  getSupportTicketEffectDraftStore,
  type SupportTicketEffectDraftRecord,
  type SupportTicketEffectDraftStore,
  type SupportTicketEffectDraftStatus,
} from "../../adapters/postgres/support-ticket-effect-draft-store.js";
import { getAcpKimiSessionOwnershipStore, type AcpKimiSessionOwnershipStore } from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import { PostgresLarkTicketThreadSyncStore, type LarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";
import { createLarkTicketAiWriteService } from "../../modules/lark-ticket-ai/lark-ticket-ai-write.service.js";
import { pickLarkTicketAiFields } from "../../domain/lark-ticket-ai.js";
import { supportTicketEffectDraftSchema, type SupportTicketEffectDraftPayload } from "../../domain/support-ticket-effect-draft.js";
import { buildAcpKimiScratchDir } from "./acp-kimi-permission-policy.js";

const EFFECT_DRAFT_FILE = "effect-draft.json";
const MAX_DRAFT_BYTES = 256 * 1024;
const SCRATCH_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FEEDBACK_BASE_ID = "XO0cbnxMIaralRsbBEolboEFgZc";
const DEFAULT_FEEDBACK_TABLE_ID = "tblRr7xDMpFMiss0";
const FEEDBACK_FIELD_NAMES = ["ticket编号", "问题总结", "答案总结", "错误分类", "错误说明"] as const;

export class SupportTicketEffectDraftError extends Error {
  constructor(
    readonly code:
      | "EFFECT_DRAFT_NOT_FOUND"
      | "EFFECT_DRAFT_INVALID"
      | "EFFECT_DRAFT_FORBIDDEN"
      | "EFFECT_DRAFT_BUSY"
      | "EFFECT_DRAFT_SNAPSHOT_CONFLICT"
      | "EFFECT_DRAFT_INTEGRITY_FAILED"
      | "EFFECT_SCHEMA_MISMATCH"
      | "EFFECT_INDEX_UPDATE_FAILED"
      | "EXTERNAL_WRITE_OUTCOME_UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "SupportTicketEffectDraftError";
  }
}

type TicketAiWriter = ReturnType<typeof createLarkTicketAiWriteService>;

export interface SupportTicketEffectDraftServiceDeps {
  draftStore?: SupportTicketEffectDraftStore;
  ownershipStore?: AcpKimiSessionOwnershipStore;
  threadStore?: Pick<LarkTicketThreadSyncStore, "get">;
  ticketAiWriter?: Pick<TicketAiWriter, "update">;
  buildLarkClient?: typeof buildAuthenticatedLarkClient;
  feedbackBaseId?: string;
  feedbackTableId?: string;
}

export function createSupportTicketEffectDraftService(deps: SupportTicketEffectDraftServiceDeps = {}) {
  const draftStore = deps.draftStore ?? getSupportTicketEffectDraftStore();
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const threadStore = deps.threadStore ?? new PostgresLarkTicketThreadSyncStore();
  const ticketAiWriter = deps.ticketAiWriter ?? createLarkTicketAiWriteService();
  const buildLarkClient = deps.buildLarkClient ?? buildAuthenticatedLarkClient;
  const feedbackBaseId = deps.feedbackBaseId ?? (process.env.SUPPORT_QA_FEEDBACK_BASE_ID?.trim() || DEFAULT_FEEDBACK_BASE_ID);
  const feedbackTableId = deps.feedbackTableId ?? (process.env.SUPPORT_QA_FEEDBACK_TABLE_ID?.trim() || DEFAULT_FEEDBACK_TABLE_ID);

  return {
    async ingestFromScratch(input: {
      operatorLarkId: string;
      sessionId: string;
      actionKey: string;
      permissionProfileId: string;
      actionRunId: string;
      ticket: { baseId: string; tableId: string; recordId: string };
      snapshotVersion: number;
    }): Promise<SupportTicketEffectDraftRecord | undefined> {
      await cleanupExpiredScratchDirs();
      const scratchDir = await resolveTrustedScratchDir(input.actionRunId);
      if (!scratchDir) return undefined;
      const draftPath = join(scratchDir, EFFECT_DRAFT_FILE);
      const metadata = await lstat(draftPath).catch(() => undefined);
      if (!metadata) return undefined;
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DRAFT_BYTES) {
        throw new SupportTicketEffectDraftError("EFFECT_DRAFT_INVALID", "Effect draft must be one UTF-8 JSON file no larger than 256 KiB.");
      }
      const raw = await readFile(draftPath, "utf8");
      let payload: SupportTicketEffectDraftPayload;
      try {
        payload = supportTicketEffectDraftSchema.parse(JSON.parse(raw));
      } catch (error) {
        throw new SupportTicketEffectDraftError("EFFECT_DRAFT_INVALID", error instanceof Error ? error.message : "Effect draft is invalid.");
      }
      if (payload.baseId !== input.ticket.baseId || payload.tableId !== input.ticket.tableId
        || payload.recordId !== input.ticket.recordId || payload.actionRunId !== input.actionRunId
        || payload.snapshotVersion !== input.snapshotVersion || !effectMatchesAction(payload.effectType, input.actionKey)) {
        throw new SupportTicketEffectDraftError("EFFECT_DRAFT_FORBIDDEN", "Effect draft identity does not match its Session, Action, Ticket, or snapshot.");
      }
      const payloadJson = JSON.stringify(payload);
      const record = await draftStore.create({
        id: randomUUID(),
        effectType: payload.effectType,
        ...input.ticket,
        sessionId: input.sessionId,
        operatorLarkId: input.operatorLarkId,
        actionRunId: input.actionRunId,
        permissionProfileId: input.permissionProfileId,
        snapshotVersion: input.snapshotVersion,
        payloadJson,
        payloadHash: digest(payloadJson),
      });
      await rm(scratchDir, { recursive: true, force: true });
      return record;
    },

    async list(input: { operatorLarkId: string; ticket: { baseId: string; tableId: string; recordId: string } }) {
      const records = await draftStore.list({ operatorLarkId: input.operatorLarkId, ...input.ticket });
      return records.map(toView);
    },

    async confirm(input: {
      operatorLarkId: string;
      masterUserId: string;
      larkBaseUrl: string;
      draftId: string;
      actionRunId: string;
      confirmed: true;
      ticket: { baseId: string; tableId: string; recordId: string };
    }) {
      const draft = await draftStore.get(input.draftId);
      if (!draft) throw new SupportTicketEffectDraftError("EFFECT_DRAFT_NOT_FOUND", "Effect draft was not found.");
      assertDraftOwnership(draft, input);
      if (draft.status === "completed") return toView(draft);
      if (draft.status === "outcome_unknown") {
        throw new SupportTicketEffectDraftError("EXTERNAL_WRITE_OUTCOME_UNKNOWN", "The external write outcome is unknown; automatic retry is disabled.");
      }
      if (draft.status === "executing") throw new SupportTicketEffectDraftError("EFFECT_DRAFT_BUSY", "Effect draft confirmation is already running.");
      const ownership = await ownershipStore.getBySessionId(draft.sessionId);
      if (!ownership || ownership.operatorLarkId !== input.operatorLarkId
        || ownership.actionRunId !== input.actionRunId
        || ownership.permissionProfileId !== draft.permissionProfileId
        || !effectMatchesAction(draft.effectType, ownership.automationActionKey ?? "")) {
        throw new SupportTicketEffectDraftError("EFFECT_DRAFT_FORBIDDEN", "Effect draft no longer matches its owning Action Session.");
      }
      const snapshot = await threadStore.get(input.ticket);
      if (!snapshot || snapshot.snapshotVersion !== draft.snapshotVersion) {
        throw new SupportTicketEffectDraftError("EFFECT_DRAFT_SNAPSHOT_CONFLICT", "Ticket snapshot changed after this effect draft was created.");
      }
      if (digest(draft.payloadJson) !== draft.payloadHash) {
        throw new SupportTicketEffectDraftError("EFFECT_DRAFT_INTEGRITY_FAILED", "Effect draft hash validation failed.");
      }
      const payload = supportTicketEffectDraftSchema.parse(JSON.parse(draft.payloadJson));
      const claimed = await draftStore.transition({
        id: draft.id,
        from: ["pending", "failed", "ticket_ai_written"],
        to: "executing",
        externalRef: draft.externalRef,
      });
      if (!claimed) throw new SupportTicketEffectDraftError("EFFECT_DRAFT_BUSY", "Effect draft confirmation state changed.");

      if (payload.effectType === "answer_feedback") {
        return confirmAnswerFeedback({
          draft,
          payload,
          masterUserId: input.masterUserId,
          larkBaseUrl: input.larkBaseUrl,
          draftStore,
          buildLarkClient,
          feedbackBaseId,
          feedbackTableId,
        });
      }

      if (draft.status !== "ticket_ai_written") {
        try {
          await ticketAiWriter.update({ recordId: draft.recordId, fields: pickLarkTicketAiFields(payload.fields) });
          await draftStore.transition({ id: draft.id, from: ["executing"], to: "ticket_ai_written", externalRef: draft.recordId });
        } catch (error) {
          await failDraft(draftStore, draft.id, "executing", "TICKET_AI_WRITE_FAILED", error);
          throw error;
        }
      }
      try {
        await updateKnowledgeIndex(ownership.kimiWorkDir, payload, draft.id);
      } catch (error) {
        await draftStore.transition({
          id: draft.id,
          from: draft.status === "ticket_ai_written" ? ["executing"] : ["ticket_ai_written"],
          to: "ticket_ai_written",
          externalRef: draft.recordId,
          errorCode: "EFFECT_INDEX_UPDATE_FAILED",
          errorMessage: safeErrorMessage(error),
        });
        throw new SupportTicketEffectDraftError("EFFECT_INDEX_UPDATE_FAILED", "Ticket AI was written, but the local knowledge index still needs recovery.");
      }
      const completed = await draftStore.transition({
        id: draft.id,
        from: draft.status === "ticket_ai_written" ? ["executing"] : ["ticket_ai_written"],
        to: "completed",
        externalRef: draft.recordId,
      });
      return toView(completed ?? (await draftStore.get(draft.id))!);
    },
  };
}

async function confirmAnswerFeedback(input: {
  draft: SupportTicketEffectDraftRecord;
  payload: Extract<SupportTicketEffectDraftPayload, { effectType: "answer_feedback" }>;
  masterUserId: string;
  larkBaseUrl: string;
  draftStore: SupportTicketEffectDraftStore;
  buildLarkClient: typeof buildAuthenticatedLarkClient;
  feedbackBaseId: string;
  feedbackTableId: string;
}) {
  let client: Awaited<ReturnType<typeof buildAuthenticatedLarkClient>>["client"];
  try {
    ({ client } = await input.buildLarkClient(input.masterUserId, input.larkBaseUrl));
    const fields = await client.getFields(input.feedbackBaseId, input.feedbackTableId);
    const names = new Set(fields.map((field) => field.field_name));
    if (FEEDBACK_FIELD_NAMES.some((name) => !names.has(name))) {
      throw new SupportTicketEffectDraftError("EFFECT_SCHEMA_MISMATCH", "Support-QA feedback table fields no longer match the confirmed draft contract.");
    }
  } catch (error) {
    await failDraft(input.draftStore, input.draft.id, "executing", "EFFECT_SCHEMA_MISMATCH", error);
    throw error;
  }
  const feedback = input.payload.feedback;
  const fields: Record<string, unknown> = {
    "ticket编号": input.payload.ticketNumber,
    "问题总结": feedback.issueSummary,
    "答案总结": feedback.answerSummary,
    ...(feedback.correct ? {} : { "错误分类": feedback.errorCategories }),
    "错误说明": feedback.correct ? "" : feedback.errorExplanation,
  };
  try {
    const created = await client.createRecord(input.feedbackBaseId, input.feedbackTableId, fields);
    const readBack = await client.getRecord(input.feedbackBaseId, input.feedbackTableId, created.record_id);
    if (readBack.record_id !== created.record_id) throw new Error("Feedback readback record did not match the created record.");
    const completed = await input.draftStore.transition({ id: input.draft.id, from: ["executing"], to: "completed", externalRef: created.record_id });
    return toView(completed ?? (await input.draftStore.get(input.draft.id))!);
  } catch (error) {
    await input.draftStore.transition({
      id: input.draft.id,
      from: ["executing"],
      to: "outcome_unknown",
      errorCode: "EXTERNAL_WRITE_OUTCOME_UNKNOWN",
      errorMessage: safeErrorMessage(error),
    });
    throw new SupportTicketEffectDraftError("EXTERNAL_WRITE_OUTCOME_UNKNOWN", "The feedback write outcome is unknown; automatic retry is disabled.");
  }
}

function assertDraftOwnership(
  draft: SupportTicketEffectDraftRecord,
  input: { operatorLarkId: string; actionRunId: string; ticket: { baseId: string; tableId: string; recordId: string } },
) {
  if (draft.operatorLarkId !== input.operatorLarkId || draft.actionRunId !== input.actionRunId
    || draft.baseId !== input.ticket.baseId || draft.tableId !== input.ticket.tableId || draft.recordId !== input.ticket.recordId) {
    throw new SupportTicketEffectDraftError("EFFECT_DRAFT_FORBIDDEN", "Effect draft does not belong to this operator, Action run, or Ticket.");
  }
}

function effectMatchesAction(effectType: SupportTicketEffectDraftRecord["effectType"], actionKey: string): boolean {
  return effectType === "answer_feedback"
    ? actionKey === "lark-ticket-support-qa-answer"
    : actionKey === "lark-ticket-support-qa-document-preview";
}

async function failDraft(store: SupportTicketEffectDraftStore, id: string, from: SupportTicketEffectDraftStatus, code: string, error: unknown) {
  await store.transition({ id, from: [from], to: "failed", errorCode: code, errorMessage: safeErrorMessage(error) });
}

function toView(record: SupportTicketEffectDraftRecord) {
  return {
    draftId: record.id,
    sessionId: record.sessionId,
    effectType: record.effectType,
    actionRunId: record.actionRunId,
    snapshotVersion: record.snapshotVersion,
    status: record.status,
    payload: JSON.parse(record.payloadJson) as unknown,
    externalRef: record.externalRef,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function updateKnowledgeIndex(
  workspaceDir: string | null,
  payload: Extract<SupportTicketEffectDraftPayload, { effectType: "ticket_ai_update" }>,
  draftId: string,
) {
  if (!workspaceDir) throw new Error("Support-QA workspace is unavailable.");
  const workspace = await realpath(workspaceDir);
  const indexPath = resolve(workspace, "docs/support-qa/knowledge-index.jsonl");
  const parent = dirname(indexPath);
  const parentReal = await realpath(parent);
  if (relative(workspace, parentReal).startsWith("..")) throw new Error("Knowledge index parent escaped the Support-QA workspace.");
  const indexStat = await lstat(indexPath);
  if (!indexStat.isFile() || indexStat.isSymbolicLink()) throw new Error("Knowledge index must be a regular file.");
  const lines = (await readFile(indexPath, "utf8")).split("\n").filter((line) => line.trim());
  const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const entry = await buildKnowledgeIndexEntry(workspace, payload);
  const recordId = entry.record_id;
  const index = records.findIndex((record) => record.record_id === recordId);
  if (index >= 0) records[index] = entry;
  else records.push(entry);
  const tempPath = join(parent, `.${basename(indexPath)}.${draftId}.tmp`);
  await rm(tempPath, { force: true });
  await writeFile(tempPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(tempPath, indexPath);
  await chmod(indexPath, indexStat.mode & 0o777);
}

async function buildKnowledgeIndexEntry(
  workspace: string,
  payload: Extract<SupportTicketEffectDraftPayload, { effectType: "ticket_ai_update" }>,
) {
  const fields = pickLarkTicketAiFields(payload.fields);
  const qaCardPath = asText(fields["QA Card 路径"]);
  const qaCardHash = await readQaCardHash(workspace, qaCardPath);
  const qaCardAction = asText(fields["QA Card 动作"]);
  const faqAction = asText(fields["FAQ 动作"]);
  const knowledgeType = asText(fields["AI知识沉淀类型"]);
  return {
    index_version: 1,
    record_id: payload.recordId,
    ticket_no: payload.ticketNumber,
    processed_at: new Date().toISOString(),
    analysis_version: asText(fields["AI分析版本"]),
    summary: asText(fields["AI Ticket 总结"]),
    reason: asText(fields["AI处理原因"]),
    evidence_summary: asText(fields["AI证据摘要"]),
    knowledge_type: knowledgeType,
    reusability: asText(fields["AI可复用等级"]),
    suggested_artifacts: asStringList(fields["AI建议产物"]),
    bug_categories: asStringList(fields["AI Bug 分类"]),
    root_causes: asStringList(fields["AI Root Cause"]),
    processes: asStringList(fields["AI 业务流程"]),
    affected_objects: asText(fields["AI 影响对象"]),
    qa_card_action: qaCardAction,
    qa_card_path: qaCardPath,
    qa_card_content_hash: qaCardHash,
    faq_action: faqAction,
    support_missing_info: asText(fields["AI Support缺失信息"]),
    qa_regression_advice: asText(fields["AI QA回归建议"]),
    confidence: asText(fields["AI Confidence"]),
    gate_status: "pending",
    llm_eval_status: "pending",
    retrieval_status: knowledgeType === "不沉淀" || qaCardAction === "不处理" && faqAction === "不更新"
      ? "excluded"
      : qaCardHash || faqAction === "已更新"
        ? "conditional"
        : "excluded",
  };
}

async function readQaCardHash(workspace: string, qaCardPath: string): Promise<string> {
  if (!qaCardPath.replaceAll("\\", "/").startsWith("docs/support-qa/qa-cards/") || qaCardPath.includes("..")) return "";
  const requested = resolve(workspace, qaCardPath);
  const metadata = await lstat(requested).catch(() => undefined);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) return "";
  const resolved = await realpath(requested);
  if (!relative(workspace, resolved).replaceAll("\\", "/").startsWith("docs/support-qa/qa-cards/")) return "";
  return digest(await readFile(resolved, "utf8"));
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : asText(value) ? [asText(value)] : [];
}

async function cleanupExpiredScratchDirs() {
  const requestedRoot = join(tmpdir(), "octo-support-qa");
  const rootMetadata = await lstat(requestedRoot).catch(() => undefined);
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) return;
  const root = await realpath(requestedRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - SCRATCH_RETENTION_MS;
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory() || entry.isSymbolicLink()) return;
    const path = join(root, entry.name);
    const metadata = await lstat(path).catch(() => undefined);
    const resolved = metadata?.isDirectory() && !metadata.isSymbolicLink() ? await realpath(path).catch(() => undefined) : undefined;
    if (resolved && relative(root, resolved) === entry.name && metadata!.mtimeMs < cutoff) {
      await rm(path, { recursive: true, force: true });
    }
  }));
}

async function resolveTrustedScratchDir(actionRunId: string): Promise<string | undefined> {
  const requested = buildAcpKimiScratchDir(actionRunId);
  const requestedRoot = dirname(requested);
  const rootMetadata = await lstat(requestedRoot).catch(() => undefined);
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new SupportTicketEffectDraftError("EFFECT_DRAFT_INVALID", "Support-QA scratch root is not a trusted directory.");
  }
  const metadata = await lstat(requested).catch(() => undefined);
  if (!metadata) return undefined;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new SupportTicketEffectDraftError("EFFECT_DRAFT_INVALID", "Action scratch path is not a trusted directory.");
  }
  const root = await realpath(requestedRoot);
  const resolved = await realpath(requested);
  if (relative(root, resolved) !== actionRunId) {
    throw new SupportTicketEffectDraftError("EFFECT_DRAFT_INVALID", "Action scratch directory escaped its trusted root.");
  }
  return resolved;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
