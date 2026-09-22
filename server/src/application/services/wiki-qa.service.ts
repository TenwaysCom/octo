import { compactWikiAnswerContext } from "../../domain/wiki-answer-context.js";
import { supportsWikiQuestion, wikiQueryTerms } from "../../domain/wiki-evidence.js";
import { z } from "zod";
import type { JsonCompletionClient } from "../../adapters/ai/json-completion-client.js";
import { createTicketSummaryJsonCompletionClient, isTicketSummaryClientError } from "../../adapters/ai/ticket-summary-client.js";
import { createWikiQaRerankClient, WikiQaRerankClientError, type WikiQaRerankClient } from "../../adapters/ai/wiki-qa-rerank-client.js";
import { createWikiKnowledgeReader } from "../../adapters/filesystem/wiki-knowledge-reader.js";
import { wikiQaExtractLog, type WikiQaExtractLog } from "../../adapters/filesystem/wiki-qa-extract-log.js";
import { wikiQaAnswerLog, type WikiQaAnswerLog } from "../../adapters/filesystem/wiki-qa-answer-log.js";
import { getWorkflowPromptStore, type WorkflowPromptStore } from "../../adapters/postgres/workflow-prompt-store.js";
import { redactSupportText } from "../../domain/support-ticket-analysis.js";
import { WIKI_QA_PROMPTS, renderWorkflowPromptTemplate } from "../../domain/workflow-prompts.js";
import { WikiQaError, wikiQuestionSchema, wikiRankingSchema, type WikiCandidate, type WikiKnowledgeEvidence, type WikiKnowledgeReader, type WikiQaProgress } from "../../domain/wiki-qa.js";
import { logger } from "../../logger.js";

const wikiLogger = logger.child({ module: "wiki-qa" });
const answerSchema = z.object({ answerMarkdown: z.string().trim().min(1).max(16000) }).strict();
interface WikiQaInput { ticketContext: string; answerContext?: string; actionRunId: string; signal?: AbortSignal; onProgress?: (progress: WikiQaProgress) => void }

const stageTitles = { extract: "问题提取", retrieve: "知识召回", rerank: "候选重排", evidence: "原始证据筛选", answer: "最终答案生成" };

async function runStage<T>(phase: WikiQaProgress["phase"], input: WikiQaInput, operation: () => Promise<T>, completedMessage?: (value: T) => string): Promise<T> {
  input.signal?.throwIfAborted();
  const notify = (status: WikiQaProgress["status"], message: string, errorCode?: string) => input.onProgress?.({
    actionRunId: input.actionRunId, layer: "server", module: "wiki-qa", stage: `server.wiki_qa.${phase}`,
    phase, status, message, ...(errorCode ? { errorCode } : {}),
  });
  notify("started", `准备开始${stageTitles[phase]}`);
  try {
    const result = await operation();
    input.signal?.throwIfAborted();
    notify("completed", completedMessage?.(result) ?? `已完成${stageTitles[phase]}`);
    return result;
  } catch (error) {
    const cancelled = input.signal?.aborted;
    const errorCode = cancelled ? "ABORTED" : error instanceof WikiQaError ? error.code : "WIKI_QA_STAGE_FAILED";
    notify(cancelled ? "cancelled" : "failed", `${stageTitles[phase]}${cancelled ? "已停止" : "失败"}`, errorCode);
    throw error;
  }
}

// A page can aggregate many unrelated incidents. Only forward statements tied
// to the selected primary sources; the original source excerpts remain available.
function scopedWikiContent(content: string, sourcePaths: string[]): string {
  if (!sourcePaths.length) return "";
  const isOtherSource = (part: string) => /raw\/(?:transcripts|documents)\//.test(part)
    && !sourcePaths.some((path) => part.includes(path));
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .split(/\n(?=#{1,6}\s)/)
    .filter((section) => !isOtherSource(section))
    .map((section) => section.split(/\n(?=\s*[-*]\s)|\n\s*\n/)
      .filter((part) => !isOtherSource(part)).join("\n\n"))
    .join("\n\n");
}

export function createWikiQaService(deps: {
  reader?: WikiKnowledgeReader;
  client?: JsonCompletionClient;
  rerankClient?: WikiQaRerankClient;
  promptStore?: Pick<WorkflowPromptStore, "getByKey">;
  extractLog?: WikiQaExtractLog;
  answerLog?: WikiQaAnswerLog;
} = {}) {
  const reader = deps.reader ?? createWikiKnowledgeReader();
  const promptStore = deps.promptStore ?? getWorkflowPromptStore();
  const extractLog = deps.extractLog ?? wikiQaExtractLog;
  const answerLog = deps.answerLog ?? wikiQaAnswerLog;

  async function complete<T>(phase: keyof typeof WIKI_QA_PROMPTS, values: Record<string, string>, schema: z.ZodType<T>, input: WikiQaInput, candidates: WikiCandidate[] = []): Promise<T> {
    input.signal?.throwIfAborted();
    const stage = `server.wiki_qa.${phase}`;
    const base = { actionRunId: input.actionRunId, layer: "server" as const, module: "wiki-qa", stage };
    const spec = WIKI_QA_PROMPTS[phase];
    const stored = await promptStore.getByKey(spec.key);
    const prompt = renderWorkflowPromptTemplate(stored?.prompt.trim() || spec.prompt, values);
    const start = Date.now();
    let content: string;
    let model: string;
    let diagnostics: import("../../adapters/ai/json-completion-client.js").CompletionDiagnostics | undefined;
    const phaseLog = phase === "extract" ? extractLog : phase === "answer" ? answerLog : undefined;
    phaseLog?.({ event: "input", actionRunId: input.actionRunId, prompt });
    try {
      const result = phase === "rerank"
        ? await (deps.rerankClient ?? createWikiQaRerankClient()).rerank({
          prompt, query: values.question, documents: candidates.map((candidate) => JSON.stringify({
            title: candidate.title, environments: candidate.environments,
            content: candidate.content.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
              .replace(/raw\/(?:transcripts|documents)\/[^\s\]\)"'<>]+\.md/g, ""),
          })),
          topN: Math.min(5, candidates.length), actionRunId: input.actionRunId, signal: input.signal,
        })
        : await (deps.client ?? createTicketSummaryJsonCompletionClient()).createJsonCompletion({
          prompt, actionRunId: input.actionRunId, signal: input.signal,
          reasoningEffort: wikiReasoningEffort(),
          ...(phase === "answer" ? { collectDiagnostics: true } : {}),
        });
      if ("results" in result) {
        const configured = process.env.WIKI_QA_RERANK_MIN_SCORE?.trim();
        const parsedScore = z.coerce.number().finite().min(0).max(1).safeParse(configured || "0.7");
        if (!parsedScore.success) throw new WikiQaRerankClientError("WIKI_QA_RERANK_CONFIG_INVALID", "Wiki rerank minimum score must be between 0 and 1.");
        const minScore = parsedScore.data;
        const accepted = result.results.filter((item) => item.relevance_score >= minScore);
        wikiLogger.info({ ...base, minScore, received: result.results.length, accepted: accepted.length }, "WIKI_QA_RERANK_SCORE_FILTERED");
        // Relevance scores cannot verify treatment prerequisites or source support.
        content = JSON.stringify({ matches: accepted.map(({ index }) => {
          const candidate = candidates[index];
          return {
            candidateId: candidate.id,
            applicability: "historical_reference",
            conditionsMatched: false,
            evidenceIds: candidate.sourceEvidence.map((source) => source.id),
            limitations: ["专用重排仅评估相关性，原始证据与处理前提尚未逐项核验"],
          };
        }) });
      } else {
        content = result.content;
        if ("diagnostics" in result) diagnostics = result.diagnostics;
      }
      model = result.model;
      wikiLogger.info({ ...base, model: result.model, durationMs: Date.now() - start, inputChars: prompt.length, outputChars: content.length, ...diagnostics }, "WIKI_QA_MODEL_COMPLETED");
    } catch (error) {
      phaseLog?.({ event: "failed", actionRunId: input.actionRunId, durationMs: Date.now() - start,
        errorCode: input.signal?.aborted ? "ABORTED" : isTicketSummaryClientError(error) ? error.code : "WIKI_QA_MODEL_FAILED" });
      input.signal?.throwIfAborted();
      wikiLogger.warn({ ...base, layer: "adapter", errorCode: isTicketSummaryClientError(error) || error instanceof WikiQaRerankClientError ? error.code : "WIKI_QA_MODEL_FAILED", durationMs: Date.now() - start }, "WIKI_QA_MODEL_FAILED");
      throw new WikiQaError("WIKI_QA_MODEL_FAILED", "Wiki 问答模型调用失败，请检查模型配置或稍后重新执行。", { ...base, layer: "adapter" });
    }
    const parsed = (() => {
      try { return schema.safeParse(JSON.parse(content)); } catch { return undefined; }
    })();
    phaseLog?.({ event: "output", actionRunId: input.actionRunId, model,
      durationMs: Date.now() - start, output: content, valid: parsed?.success === true, ...(phase === "answer" ? { diagnostics } : {}) });
    input.signal?.throwIfAborted();
    if (!parsed?.success) {
      if (phase === "answer") answerLog({ event: "failed", actionRunId: input.actionRunId, durationMs: Date.now() - start, errorCode: "WIKI_QA_OUTPUT_INVALID" });
      throw new WikiQaError("WIKI_QA_OUTPUT_INVALID", "Wiki 问答模型返回了无效结果，请重新执行。", base);
    }
    return parsed.data;
  }

  async function retrieve(input: WikiQaInput): Promise<{ question: string; evidence: WikiKnowledgeEvidence[] }> {
    const ticketContext = redactSupportText(input.ticketContext);
    const extracted = await runStage("extract", input, () => complete("extract", { ticket_context: ticketContext }, wikiQuestionSchema, input));
    let candidates;
    try { candidates = await runStage("retrieve", input, () => reader.search({ ...extracted, signal: input.signal }),
      (items) => `已完成知识召回，找到 ${items.length} 篇候选`); } catch (error) {
      if (error instanceof WikiQaError) throw new WikiQaError(error.code, error.message, { ...error.diagnostic, actionRunId: input.actionRunId });
      throw error;
    }
    input.signal?.throwIfAborted();
    const rerankCandidates = candidates;
    wikiLogger.info({ actionRunId: input.actionRunId, layer: "server", stage: "server.wiki_qa.retrieve", candidates: candidates.length, rerankCandidates: rerankCandidates.length }, "WIKI_QA_CANDIDATES_READY");
    if (!candidates.length) return { question: extracted.question, evidence: [] };
    const ranked = await runStage("rerank", input, () => complete("rerank", {
      question: extracted.question, ticket_context: ticketContext, candidates: JSON.stringify(rerankCandidates),
    }, wikiRankingSchema, input, rerankCandidates), (result) => `已完成候选重排，选出 ${result.matches.length} 篇资料`);
    const seen = new Set<string>();
    return runStage("evidence", input, async () => {
      const evidence: WikiKnowledgeEvidence[] = ranked.matches.map((match, index) => {
        const candidate = rerankCandidates.find((item) => item.id === match.candidateId);
        if (!candidate || seen.has(candidate.path) || new Set(match.evidenceIds).size !== match.evidenceIds.length
          || match.evidenceIds.some((id) => !candidate.sourceEvidence.some((source) => source.id === id))) {
          throw new WikiQaError("WIKI_QA_REFERENCE_INVALID", "Wiki 检索结果包含重复页面或候选之外的引用，请重新执行。", {
            actionRunId: input.actionRunId, layer: "server", module: "wiki-qa", stage: "server.wiki_qa.rerank",
          });
        }
        seen.add(candidate.path);
        const sources = reader.selectEvidence
          ? reader.selectEvidence({ candidate, question: extracted, evidenceIds: match.evidenceIds, signal: input.signal })
          : candidate.sourceEvidence.filter((source) => match.evidenceIds.includes(source.id));
        const omittedEvidence = sources.length < match.evidenceIds.length;
        const historical = candidate.historicalOnly || !match.conditionsMatched || !sources.length || omittedEvidence || sources.some((source) => !source.complete);
        return { sourceId: index + 1, path: candidate.path, title: candidate.title, status: candidate.status,
          environments: candidate.environments, content: scopedWikiContent(candidate.content, sources.map((source) => source.path)), sourceEvidence: sources,
          applicability: historical ? "historical_reference" : match.applicability,
          limitations: [...new Set([...candidate.limitations, ...match.limitations,
            ...(!match.conditionsMatched ? ["当前材料尚未确认处理路径的关键前提"] : []),
            ...(omittedEvidence ? ["部分来源未找到相关原文片段或完整上下文超出摘录预算，未作为本轮支持证据"] : []),
            ...(!sources.length ? ["未找到支撑当前判断的原始证据"] : [])])],
        };
      });
      const terms = wikiQueryTerms([extracted.question, ...extracted.keywords, ...extracted.objects].join(" "));
      const supported = evidence.filter((item) => supportsWikiQuestion(extracted.question, terms,
        [item.title, item.content, ...item.sourceEvidence.map((source) => source.content)].join("\n")))
        .slice(0, 3).map((item, index) => ({ ...item, sourceId: index + 1 }));
      wikiLogger.info({ actionRunId: input.actionRunId, layer: "server", stage: "server.wiki_qa.evidence", selected: evidence.length, supported: supported.length }, "WIKI_QA_EVIDENCE_FILTERED");
      return { question: extracted.question, evidence: supported };
    }, (result) => `已完成原始证据筛选，保留 ${result.evidence.length} 篇相关资料`);
  }

  return {
    retrieve,
    async answer(input: WikiQaInput): Promise<{ question: string; evidence: WikiKnowledgeEvidence[]; answerMarkdown: string }> {
      const retrieved = await retrieve(input);
      return runStage("answer", input, async () => {
        const answer = await complete("answer", {
          question: retrieved.question, ticket_context: redactSupportText(compactWikiAnswerContext(input.answerContext ?? input.ticketContext)), knowledge_evidence: JSON.stringify(retrieved.evidence),
        }, answerSchema, input);
        const markers = [...answer.answerMarkdown.matchAll(/\[([^\]\n]*)\]/g)]
          .map((match) => match[1]).filter((marker) => marker !== "EMAIL" && marker !== "REFERENCE");
        const citations = markers.flatMap((marker) => marker.split(/\s*[,，、]\s*/).map(Number));
        if (markers.some((marker) => !/^\d+(?:\s*[,，、]\s*\d+)*$/.test(marker))
          || citations.some((id) => !retrieved.evidence.some((item) => item.sourceId === id))
          || /\[[^\]]*\]\s*\(|https?:\/\/|\[\^/i.test(answer.answerMarkdown)) {
          answerLog({ event: "failed", actionRunId: input.actionRunId, errorCode: "WIKI_QA_REFERENCE_INVALID" });
          throw new WikiQaError("WIKI_QA_REFERENCE_INVALID", "回答引用了未提供的来源，请重新执行。", {
            actionRunId: input.actionRunId, layer: "server", module: "wiki-qa", stage: "server.wiki_qa.answer",
          });
        }
        const sources = retrieved.evidence.map((item) =>
          `[${item.sourceId}] ${item.title.replace(/[\r\n]/g, " ")}（${item.status === "draft" ? "草稿" : item.status === "confirmed" ? "已确认" : "状态待确认"}${item.applicability === "historical_reference" ? "；仅供历史参考" : ""}）\n来源：docs/llm-wiki/${item.path}`);
        input.signal?.throwIfAborted();
        return { ...retrieved, answerMarkdown: [redactSupportText(answer.answerMarkdown), ...(sources.length ? ["参考资料：", ...sources] : [])].join("\n\n") };
      });
    },
  };
}

function wikiReasoningEffort(): "low" | "high" | "max" | undefined {
  const value = z.enum(["low", "high", "max", "provider"]).parse(process.env.WIKI_QA_ANSWER_REASONING_EFFORT?.trim() || "low");
  return value === "provider" ? undefined : value;
}
