import { z } from "zod";
import type { JsonCompletionClient } from "../../adapters/ai/json-completion-client.js";
import { createTicketSummaryJsonCompletionClient, isTicketSummaryClientError } from "../../adapters/ai/ticket-summary-client.js";
import { createWikiKnowledgeReader } from "../../adapters/filesystem/wiki-knowledge-reader.js";
import { getWorkflowPromptStore, type WorkflowPromptStore } from "../../adapters/postgres/workflow-prompt-store.js";
import { redactSupportText } from "../../domain/support-ticket-analysis.js";
import { WIKI_QA_PROMPTS, renderWorkflowPromptTemplate } from "../../domain/workflow-prompts.js";
import { WikiQaError, wikiQuestionSchema, wikiRankingSchema, type WikiKnowledgeEvidence, type WikiKnowledgeReader } from "../../domain/wiki-qa.js";
import { logger } from "../../logger.js";

const wikiLogger = logger.child({ module: "wiki-qa" });
const answerSchema = z.object({ answerMarkdown: z.string().trim().min(1).max(16000) }).strict();
interface WikiQaInput { ticketContext: string; actionRunId: string; signal?: AbortSignal }

// A page can aggregate many unrelated incidents. Only forward statements tied
// to the selected primary sources; the original source excerpts remain available.
function scopedWikiContent(content: string, sourcePaths: string[]): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .split(/\n(?=\s*[-*]\s)|\n\s*\n/)
    .filter((part) => sourcePaths.some((path) => part.includes(path))
      && /[\p{L}\p{N}]/u.test(part.replace(/\[[^\]]*\]\([^)]*\)/g, "")))
    .join("\n\n");
}

export function createWikiQaService(deps: {
  reader?: WikiKnowledgeReader;
  client?: JsonCompletionClient;
  promptStore?: Pick<WorkflowPromptStore, "getByKey">;
} = {}) {
  const reader = deps.reader ?? createWikiKnowledgeReader();
  const promptStore = deps.promptStore ?? getWorkflowPromptStore();

  async function complete<T>(phase: keyof typeof WIKI_QA_PROMPTS, values: Record<string, string>, schema: z.ZodType<T>, input: WikiQaInput): Promise<T> {
    input.signal?.throwIfAborted();
    const stage = `server.wiki_qa.${phase}`;
    const base = { actionRunId: input.actionRunId, layer: "server" as const, module: "wiki-qa", stage };
    const spec = WIKI_QA_PROMPTS[phase];
    const stored = await promptStore.getByKey(spec.key);
    const prompt = renderWorkflowPromptTemplate(stored?.prompt.trim() || spec.prompt, values);
    const start = Date.now();
    let content: string;
    try {
      const client = deps.client ?? createTicketSummaryJsonCompletionClient();
      const result = await client.createJsonCompletion({ prompt, actionRunId: input.actionRunId, signal: input.signal });
      input.signal?.throwIfAborted();
      content = result.content;
      wikiLogger.info({ ...base, model: result.model, durationMs: Date.now() - start }, "WIKI_QA_MODEL_COMPLETED");
    } catch (error) {
      input.signal?.throwIfAborted();
      wikiLogger.warn({ ...base, layer: "adapter", errorCode: isTicketSummaryClientError(error) ? error.code : "WIKI_QA_MODEL_FAILED", durationMs: Date.now() - start }, "WIKI_QA_MODEL_FAILED");
      throw new WikiQaError("WIKI_QA_MODEL_FAILED", "Wiki 问答模型调用失败，请检查模型配置或稍后重新执行。", { ...base, layer: "adapter" });
    }
    try { return schema.parse(JSON.parse(content)); } catch {
      throw new WikiQaError("WIKI_QA_OUTPUT_INVALID", "Wiki 问答模型返回了无效结果，请重新执行。", base);
    }
  }

  async function retrieve(input: WikiQaInput): Promise<{ question: string; evidence: WikiKnowledgeEvidence[] }> {
    const ticketContext = redactSupportText(input.ticketContext);
    const extracted = await complete("extract", { ticket_context: ticketContext }, wikiQuestionSchema, input);
    let candidates;
    try { candidates = await reader.search({ ...extracted, signal: input.signal }); } catch (error) {
      if (error instanceof WikiQaError) throw new WikiQaError(error.code, error.message, { ...error.diagnostic, actionRunId: input.actionRunId });
      throw error;
    }
    input.signal?.throwIfAborted();
    wikiLogger.info({ actionRunId: input.actionRunId, layer: "server", stage: "server.wiki_qa.retrieve", candidates: candidates.length }, "WIKI_QA_CANDIDATES_READY");
    if (!candidates.length) return { question: extracted.question, evidence: [] };
    const ranked = await complete("rerank", {
      question: extracted.question, ticket_context: ticketContext, candidates: JSON.stringify(candidates),
    }, wikiRankingSchema, input);
    const seen = new Set<string>();
    const evidence: WikiKnowledgeEvidence[] = ranked.matches.map((match, index) => {
      const candidate = candidates.find((item) => item.id === match.candidateId);
      if (!candidate || seen.has(candidate.path) || new Set(match.evidenceIds).size !== match.evidenceIds.length
        || match.evidenceIds.some((id) => !candidate.sourceEvidence.some((source) => source.id === id))) {
        throw new WikiQaError("WIKI_QA_REFERENCE_INVALID", "Wiki 检索结果包含重复页面或候选之外的引用，请重新执行。", {
          actionRunId: input.actionRunId, layer: "server", module: "wiki-qa", stage: "server.wiki_qa.rerank",
        });
      }
      seen.add(candidate.path);
      const sources = candidate.sourceEvidence.filter((source) => match.evidenceIds.includes(source.id));
      const historical = candidate.historicalOnly || !match.conditionsMatched || !sources.length || sources.some((source) => !source.complete);
      return { sourceId: index + 1, path: candidate.path, title: candidate.title, status: candidate.status,
        environments: candidate.environments, content: scopedWikiContent(candidate.content, sources.map((source) => source.path)), sourceEvidence: sources,
        applicability: historical ? "historical_reference" : match.applicability,
        limitations: [...new Set([...candidate.limitations, ...match.limitations,
          ...(!match.conditionsMatched ? ["当前材料尚未确认处理路径的关键前提"] : []),
          ...(!sources.length ? ["未找到支撑当前判断的原始证据"] : [])])],
      };
    });
    return { question: extracted.question, evidence };
  }

  return {
    retrieve,
    async answer(input: WikiQaInput): Promise<{ question: string; evidence: WikiKnowledgeEvidence[]; answerMarkdown: string }> {
      const retrieved = await retrieve(input);
      const answer = await complete("answer", {
        question: retrieved.question, ticket_context: redactSupportText(input.ticketContext), knowledge_evidence: JSON.stringify(retrieved.evidence),
      }, answerSchema, input);
      const markers = [...answer.answerMarkdown.matchAll(/\[([^\]\n]*)\]/g)]
        .map((match) => match[1]).filter((marker) => marker !== "EMAIL" && marker !== "REFERENCE");
      const citations = markers.flatMap((marker) => marker.split(/\s*[,，、]\s*/).map(Number));
      if (markers.some((marker) => !/^\d+(?:\s*[,，、]\s*\d+)*$/.test(marker))
        || citations.some((id) => !retrieved.evidence.some((item) => item.sourceId === id))
        || /\[[^\]]*\]\s*\(|https?:\/\/|\[\^/i.test(answer.answerMarkdown)) {
        throw new WikiQaError("WIKI_QA_REFERENCE_INVALID", "回答引用了未提供的来源，请重新执行。", {
          actionRunId: input.actionRunId, layer: "server", module: "wiki-qa", stage: "server.wiki_qa.answer",
        });
      }
      const sources = retrieved.evidence.map((item) =>
        `[${item.sourceId}] ${item.title.replace(/[\r\n]/g, " ")}（${item.status === "draft" ? "草稿" : item.status === "confirmed" ? "已确认" : "状态待确认"}${item.applicability === "historical_reference" ? "；仅供历史参考" : ""}）\n来源：docs/llm-wiki/${item.path}`);
      input.signal?.throwIfAborted();
      return { ...retrieved, answerMarkdown: [redactSupportText(answer.answerMarkdown), ...(sources.length ? ["参考资料：", ...sources] : [])].join("\n\n") };
    },
  };
}
