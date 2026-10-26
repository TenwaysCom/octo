import { z } from "zod";
import { analyzeTicketShadow } from "./lark-ticket-shadow-summary.service.js";
import { createWikiQaService } from "./wiki-qa.service.js";
import { createWikiKnowledgeReader } from "../../adapters/filesystem/wiki-knowledge-reader.js";
import { createTicketSummaryJsonCompletionClient } from "../../adapters/ai/ticket-summary-client.js";
import type { JsonCompletionClient } from "../../adapters/ai/json-completion-client.js";
import { createWikiQaRerankClient, type WikiQaRerankClient } from "../../adapters/ai/wiki-qa-rerank-client.js";
import type { WikiKnowledgeReader } from "../../domain/wiki-qa.js";
import { renderWorkflowPromptTemplate } from "../../domain/workflow-prompts.js";

const message = z.object({ messageId: z.string().min(1), createdAt: z.string(),
  senderRole: z.enum(["user", "bot", "system", "unknown"]), senderLabel: z.string().optional(),
  text: z.string(), hasArtifact: z.boolean(), replyTo: z.string().optional() }).strict();
export const ticketEvalRequestSchema = z.object({
  scenario: z.enum(["ticket.early_analysis", "ticket.reply"]), actionRunId: z.string().min(1),
  messages: z.array(message).min(1),
  config: z.object({ provider: z.enum(["deepseek", "zcode"]), model: z.string().min(1),
    prompts: z.record(z.string(), z.string().min(1)), timeoutMs: z.number().int().positive().max(600000).default(120000),
    wikiWorkspace: z.string().optional(),
    rerank: z.object({ mode: z.enum(["general", "rerank"]), url: z.url(), model: z.string().min(1),
      minScore: z.number().min(0).max(1).default(0.7) }).strict().optional(),
  }).strict(),
  exclusionTokens: z.array(z.string().min(3)).default([]),
}).strict();
export type TicketEvalRequest = z.infer<typeof ticketEvalRequestSchema>;

export async function executeTicketEval(request: TicketEvalRequest, deps: {
  client?: JsonCompletionClient; reader?: WikiKnowledgeReader; rerankClient?: WikiQaRerankClient;
} = {}) {
  const input = ticketEvalRequestSchema.parse(request);
  const calls: Array<Record<string, unknown>> = [];
  const client = deps.client ?? createTicketSummaryJsonCompletionClient({ provider: input.config.provider,
    model: input.config.model, timeoutMs: input.config.timeoutMs });
  const tracedClient: JsonCompletionClient = { async createJsonCompletion(call) {
    const trace: Record<string, unknown> = { prompt: call.prompt }; calls.push(trace);
    const result = await client.createJsonCompletion(call); Object.assign(trace, result); return result;
  } };
  const context = input.messages.map((m) => `[${m.messageId}] ${m.createdAt} ${m.senderLabel ?? m.senderRole}\n${m.text}${m.replyTo ? `\n回复: ${m.replyTo}` : ""}`).join("\n\n");
  const promptStore = { async getByKey(key: string) {
    const prompt = input.config.prompts[key];
    if (!prompt?.trim()) throw new Error("EVAL_PROMPT_MISSING");
    return { key, prompt, note: null, createdAt: "", updatedAt: "" };
  } };
  try {
    if (input.scenario === "ticket.early_analysis") {
      const template = await promptStore.getByKey("lark_ticket.support_qa.summarize");
      const prompt = renderWorkflowPromptTemplate(template.prompt, { ticket_context: context, user_message: "仅分析所提供的消息；信息不足时明确说明。" });
      const output = await analyzeTicketShadow({ prompt, messages: input.messages, client: tracedClient, actionRunId: input.actionRunId });
      return { status: "ok", output, calls };
    }
    if (!input.config.wikiWorkspace || !input.config.rerank) throw new Error("EVAL_WIKI_CONFIG_MISSING");
    const original = deps.reader ?? createWikiKnowledgeReader({ workspaceDir: input.config.wikiWorkspace });
    const reader: WikiKnowledgeReader = {
      async search(query) {
        const candidates = await original.search(query);
        return candidates.filter((candidate) => !input.exclusionTokens.some((token) =>
          JSON.stringify(candidate).includes(token)));
      },
      ...(original.selectEvidence ? { selectEvidence: original.selectEvidence.bind(original) } : {}),
    };
    const rerank = input.config.rerank;
    const rerankClient = deps.rerankClient ?? createWikiQaRerankClient({ env: {
      WIKI_QA_RERANK_MODE: rerank.mode, WIKI_QA_RERANK_URL: rerank.url, WIKI_QA_RERANK_MODEL: rerank.model,
      WIKI_QA_RERANK_TIMEOUT_MS: String(input.config.timeoutMs),
      WIKI_QA_RERANK_API_KEY: process.env.WIKI_QA_RERANK_API_KEY, ZCODE_API_KEY: process.env.ZCODE_API_KEY,
    }, diagnosticLog: () => {} });
    const service = createWikiQaService({ client: tracedClient, reader, promptStore,
      rerankClient: { async rerank(call) { const trace: Record<string, unknown> = { ...call, signal: undefined };
        calls.push(trace); const result = await rerankClient.rerank(call); Object.assign(trace, result); return result; } },
      extractLog: () => {}, answerLog: () => {},
    });
    const output = await service.answer({ ticketContext: context, answerContext: context, actionRunId: input.actionRunId });
    return { status: "ok", output, calls };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "EVAL_EXECUTION_FAILED";
    return { status: /OUTPUT_INVALID|EVIDENCE_OUTSIDE|REFERENCE_INVALID/.test(code) ? "invalid_output" : "error",
      error: { errorCode: code, layer: "server", module: "ticket-eval", stage: "execute", actionRunId: input.actionRunId }, calls };
  }
}
