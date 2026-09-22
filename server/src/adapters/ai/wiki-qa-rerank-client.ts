import { z } from "zod";
import { wikiQaRerankLog, type WikiQaRerankLog } from "../filesystem/wiki-qa-rerank-log.js";
import { logger } from "../../logger.js";

const rerankLogger = logger.child({ module: "wiki-qa-rerank-client" });
const DEFAULT_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_MODEL = "glm-5.3-flash";
const DEFAULT_TIMEOUT_MS = 60_000;

const configSchema = z.object({
  mode: z.enum(["general", "rerank"]),
  url: z.string().trim().url().refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash;
    } catch { return false; }
  }),
  model: z.string().trim().min(1),
  timeoutMs: z.coerce.number().int().positive().max(2_147_483_647),
});
const responseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    finish_reason: z.string().nullable().optional(),
    message: z.object({ content: z.string().trim().min(1) }),
  })).min(1),
});
const rerankResponseSchema = z.object({
  results: z.array(z.object({
    index: z.number().int().nonnegative(),
    relevance_score: z.number().finite(),
  })),
});

export interface WikiQaRerankInput {
  prompt: string;
  query: string;
  documents: string[];
  topN: number;
  actionRunId: string;
  signal?: AbortSignal;
}
export type WikiQaRerankResult =
  | { mode: "general"; content: string; model: string }
  | { mode: "rerank"; results: Array<{ index: number; relevance_score: number }>; model: string };
export interface WikiQaRerankClient {
  rerank(input: WikiQaRerankInput): Promise<WikiQaRerankResult>;
}

export class WikiQaRerankClientError extends Error {
  constructor(
    readonly code: "WIKI_QA_RERANK_CONFIG_INVALID" | "WIKI_QA_RERANK_TIMEOUT"
      | "WIKI_QA_RERANK_REQUEST_FAILED" | "WIKI_QA_RERANK_RESPONSE_INVALID",
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "WikiQaRerankClientError";
  }
}

export function createWikiQaRerankClient(deps: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  diagnosticLog?: WikiQaRerankLog;
} = {}): WikiQaRerankClient {
  const env = deps.env ?? process.env;
  const configuredMode = env.WIKI_QA_RERANK_MODE?.trim() ?? "general";
  // Preserve the existing timeout unless the dedicated override is supplied.
  const sharedTimeout = Number(env.LARK_TICKET_SUMMARY_TIMEOUT_MS);
  const parsed = configSchema.safeParse({
    mode: configuredMode,
    url: env.WIKI_QA_RERANK_URL ?? (configuredMode === "general" ? DEFAULT_URL : undefined),
    model: env.WIKI_QA_RERANK_MODEL ?? (configuredMode === "general" ? DEFAULT_MODEL : undefined),
    timeoutMs: env.WIKI_QA_RERANK_TIMEOUT_MS
      ?? (Number.isSafeInteger(sharedTimeout) && sharedTimeout > 0 ? sharedTimeout : DEFAULT_TIMEOUT_MS),
  });
  if (!parsed.success) {
    throw new WikiQaRerankClientError("WIKI_QA_RERANK_CONFIG_INVALID", "Wiki rerank mode, URL, model or timeout configuration is invalid. Dedicated rerank requires an explicit URL and model.");
  }
  const { mode, url, model, timeoutMs } = parsed.data;
  // Never forward an existing provider key to a custom endpoint.
  const apiKey = (env.WIKI_QA_RERANK_API_KEY ?? (mode === "general" && url === DEFAULT_URL ? env.ZCODE_API_KEY : undefined))?.trim();
  if (url === DEFAULT_URL && !apiKey) {
    throw new WikiQaRerankClientError("WIKI_QA_RERANK_CONFIG_INVALID", "Wiki rerank requires WIKI_QA_RERANK_API_KEY or ZCODE_API_KEY for the default endpoint.");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const diagnosticLog = deps.diagnosticLog ?? wikiQaRerankLog;

  return {
    async rerank(input) {
      input.signal?.throwIfAborted();
      const baseLog = { actionRunId: input.actionRunId, layer: "adapter", mode, model };
      const controller = new AbortController();
      const abort = () => controller.abort();
      input.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      const startedAt = Date.now();
      const requestBody = JSON.stringify(mode === "rerank" ? {
        model,
        query: input.query,
        documents: input.documents,
        top_n: input.topN,
        return_documents: false,
      } : {
        model,
        messages: [
          { role: "system", content: "Return only a valid JSON object that conforms to the requested schema." },
          { role: "user", content: input.prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      try {
        diagnosticLog({ ...baseLog, event: "input", requestBody });
        const response = await fetchImpl(url, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: requestBody,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new WikiQaRerankClientError("WIKI_QA_RERANK_REQUEST_FAILED", `Wiki rerank request failed with status ${response.status}.`, response.status);
        }
        const output = await response.text();
        diagnosticLog({ ...baseLog, event: "output", output, statusCode: response.status, durationMs: Date.now() - startedAt });
        let payload: unknown;
        try { payload = JSON.parse(output); } catch { payload = undefined; }
        controller.signal.throwIfAborted();
        if (mode === "rerank") {
          const result = rerankResponseSchema.safeParse(payload);
          if (!result.success || result.data.results.length > input.topN
            || result.data.results.some((item) => item.index >= input.documents.length)
            || new Set(result.data.results.map((item) => item.index)).size !== result.data.results.length) {
            throw new WikiQaRerankClientError("WIKI_QA_RERANK_RESPONSE_INVALID", "Wiki rerank returned invalid scores or candidate indices.");
          }
          const results = result.data.results.sort((a, b) => b.relevance_score - a.relevance_score || a.index - b.index);
          rerankLogger.info({ ...baseLog, stage: "adapter.wiki_qa_rerank.completed", statusCode: response.status, durationMs: Date.now() - startedAt }, "WIKI_QA_RERANK_COMPLETED");
          return { mode, results, model };
        }
        const result = responseSchema.safeParse(payload);
        if (!result.success || result.data.choices[0].finish_reason === "length") {
          throw new WikiQaRerankClientError("WIKI_QA_RERANK_RESPONSE_INVALID", "Wiki rerank returned an invalid, empty or truncated completion.");
        }
        const responseModel = result.data.model ?? model;
        rerankLogger.info({ ...baseLog, model: responseModel, stage: "adapter.wiki_qa_rerank.completed", statusCode: response.status, durationMs: Date.now() - startedAt }, "WIKI_QA_RERANK_COMPLETED");
        return { mode, content: result.data.choices[0].message.content, model: responseModel };
      } catch (error) {
        const failure = controller.signal.aborted
          ? new WikiQaRerankClientError("WIKI_QA_RERANK_TIMEOUT", `Wiki rerank request timed out after ${timeoutMs}ms.`)
          : error instanceof WikiQaRerankClientError ? error
            : new WikiQaRerankClientError("WIKI_QA_RERANK_REQUEST_FAILED", "Wiki rerank request failed before a valid response was received.");
        diagnosticLog({ ...baseLog, event: "failed", errorCode: input.signal?.aborted ? "ABORTED" : failure.code, statusCode: failure.statusCode, durationMs: Date.now() - startedAt });
        input.signal?.throwIfAborted();
        rerankLogger.warn({ ...baseLog, stage: "adapter.wiki_qa_rerank.failed", errorCode: failure.code, statusCode: failure.statusCode, durationMs: Date.now() - startedAt }, "WIKI_QA_RERANK_FAILED");
        throw failure;
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", abort);
      }
    },
  };
}
