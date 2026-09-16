import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import { redactSupportText } from "../../domain/support-ticket-analysis.js";

export type SupportKnowledgeSourceKind = "controlled_document" | "approved_case";

export interface SupportKnowledgeSearchHit {
  documentId: string;
  chunkId: string;
  sourceKind: SupportKnowledgeSourceKind;
  sourceRef: string;
  title: string;
  redactedContent: string;
  tags: string[];
  approvedAt: string;
  score: number;
}

export interface SupportKnowledgeRetriever {
  searchApproved(input: { query: string; limit?: number }): Promise<SupportKnowledgeSearchHit[]>;
}

export interface SupportKnowledgeStore extends SupportKnowledgeRetriever {
  upsertApprovedDocument(input: {
    sourceKind: SupportKnowledgeSourceKind;
    sourceRef: string;
    title: string;
    redactedSummary?: string;
    tags?: string[];
    approvedBy: string;
    approvedAt: string;
  }): Promise<{ id: string }>;
  replaceRedactedChunks(input: {
    documentId: string;
    chunks: string[];
  }): Promise<void>;
  revoke(input: { documentId: string }): Promise<void>;
}

type KnowledgeRow = Pick<Selectable<DatabaseSchema["support_knowledge_documents"]>,
  "id" | "source_kind" | "source_ref" | "title" | "tags_json" | "approved_at"> & {
  chunk_id: string;
  redacted_content: string;
};

export class PostgresSupportKnowledgeStore implements SupportKnowledgeStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async upsertApprovedDocument(input: {
    sourceKind: SupportKnowledgeSourceKind;
    sourceRef: string;
    title: string;
    redactedSummary?: string;
    tags?: string[];
    approvedBy: string;
    approvedAt: string;
  }): Promise<{ id: string }> {
    const existing = await this.database.selectFrom("support_knowledge_documents")
      .select(["id", "created_at"])
      .where("source_kind", "=", input.sourceKind)
      .where("source_ref", "=", input.sourceRef)
      .executeTakeFirst();
    const now = new Date().toISOString();
    const id = existing?.id ?? randomUUID();
    await this.database.insertInto("support_knowledge_documents").values({
      id,
      source_kind: input.sourceKind,
      source_ref: input.sourceRef,
      title: redactSupportText(input.title),
      redacted_summary: input.redactedSummary ? redactSupportText(input.redactedSummary) : null,
      tags_json: JSON.stringify(normalizeTags(input.tags)),
      approval_status: "approved",
      approved_by: input.approvedBy,
      approved_at: input.approvedAt,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }).onConflict((conflict) => conflict.columns(["source_kind", "source_ref"]).doUpdateSet({
      title: redactSupportText(input.title),
      redacted_summary: input.redactedSummary ? redactSupportText(input.redactedSummary) : null,
      tags_json: JSON.stringify(normalizeTags(input.tags)),
      approval_status: "approved",
      approved_by: input.approvedBy,
      approved_at: input.approvedAt,
      updated_at: now,
    })).execute();
    return { id };
  }

  async replaceRedactedChunks(input: { documentId: string; chunks: string[] }): Promise<void> {
    const chunks = input.chunks.map(redactSupportText).filter(Boolean).slice(0, 50);
    const now = new Date().toISOString();
    await this.database.transaction().execute(async (trx) => {
      const document = await trx.selectFrom("support_knowledge_documents")
        .select("approval_status")
        .where("id", "=", input.documentId)
        .executeTakeFirst();
      if (!document || document.approval_status !== "approved") {
        throw new Error("SUPPORT_KNOWLEDGE_DOCUMENT_NOT_APPROVED");
      }
      await trx.deleteFrom("support_knowledge_chunks").where("document_id", "=", input.documentId).execute();
      if (!chunks.length) return;
      await trx.insertInto("support_knowledge_chunks").values(chunks.map((redactedContent, index) => ({
        id: randomUUID(),
        document_id: input.documentId,
        sequence: index + 1,
        redacted_content: redactedContent.slice(0, 6000),
        created_at: now,
        updated_at: now,
      }))).execute();
    });
  }

  async revoke(input: { documentId: string }): Promise<void> {
    const now = new Date().toISOString();
    await this.database.updateTable("support_knowledge_documents")
      .set({ approval_status: "revoked", updated_at: now })
      .where("id", "=", input.documentId)
      .execute();
  }

  async searchApproved(input: { query: string; limit?: number }): Promise<SupportKnowledgeSearchHit[]> {
    const terms = searchTerms(input.query);
    if (!terms.length) return [];
    const rows = await this.database.selectFrom("support_knowledge_chunks as chunk")
      .innerJoin("support_knowledge_documents as document", "document.id", "chunk.document_id")
      .select([
        "document.id",
        "document.source_kind",
        "document.source_ref",
        "document.title",
        "document.tags_json",
        "document.approved_at",
        "chunk.id as chunk_id",
        "chunk.redacted_content",
      ])
      .where("document.approval_status", "=", "approved")
      .orderBy("document.approved_at", "desc")
      .limit(500)
      .execute() as KnowledgeRow[];
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
    return rows.map((row) => {
      const title = row.title.toLowerCase();
      const content = row.redacted_content.toLowerCase();
      const tags = parseTags(row.tags_json);
      const score = terms.reduce((total, term) => total
        + (title.includes(term) ? 4 : 0)
        + (content.includes(term) ? 2 : 0)
        + (tags.some((tag) => tag.toLowerCase().includes(term)) ? 3 : 0), 0);
      return {
        documentId: row.id,
        chunkId: row.chunk_id,
        sourceKind: row.source_kind,
        sourceRef: row.source_ref,
        title: row.title,
        redactedContent: row.redacted_content,
        tags,
        approvedAt: row.approved_at,
        score,
      };
    }).filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score || right.approvedAt.localeCompare(left.approvedAt))
      .slice(0, limit);
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => redactSupportText(tag)).filter(Boolean))].slice(0, 20);
}

function parseTags(value: string): string[] {
  try {
    const tags = JSON.parse(value);
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function searchTerms(query: string): string[] {
  const normalized = redactSupportText(query).toLowerCase();
  const latinTerms = normalized.match(/[a-z0-9_-]{2,}/g) ?? [];
  const hanTerms = [...normalized.matchAll(/[\u3400-\u9fff]{2,}/g)]
    .flatMap(([phrase]) => Array.from({ length: Math.max(phrase.length - 1, 0) }, (_, index) => phrase.slice(index, index + 2)));
  return [...new Set([...latinTerms, ...hanTerms])].slice(0, 30);
}

let sharedSupportKnowledgeStore: SupportKnowledgeStore | undefined;

export function getSupportKnowledgeStore(): SupportKnowledgeStore {
  if (!sharedSupportKnowledgeStore) {
    sharedSupportKnowledgeStore = new PostgresSupportKnowledgeStore();
  }
  return sharedSupportKnowledgeStore;
}
