import { createFileLogger, logger } from "../../logger.js";
import { redactWikiQaLogText } from "./wiki-qa-extract-log.js";

export type WikiQaRerankEvent = { actionRunId: string; mode: "general" | "rerank"; model: string; durationMs?: number; statusCode?: number } & (
  | { event: "input"; requestBody: string }
  | { event: "output"; output: string }
  | { event: "failed"; errorCode: string }
);
export type WikiQaRerankLog = (event: WikiQaRerankEvent) => void;

export function createWikiQaRerankLog(deps: {
  env?: NodeJS.ProcessEnv;
  createLogger?: typeof createFileLogger;
} = {}): WikiQaRerankLog {
  const env = deps.env ?? process.env;
  let sink: ReturnType<typeof createFileLogger> | undefined;
  let failed = false;
  const fail = () => {
    if (!failed) logger.warn({ layer: "adapter", module: "wiki-qa-rerank-log", stage: "adapter.wiki_qa.rerank_log", errorCode: "WIKI_QA_RERANK_LOG_FAILED" }, "WIKI_QA_RERANK_LOG_FAILED");
    failed = true;
  };
  return (entry) => {
    if (env.WIKI_QA_RERANK_LOG_ENABLED?.trim().toLowerCase() !== "true" || failed) return;
    try {
      if (!sink) {
        sink = (deps.createLogger ?? createFileLogger)(env.WIKI_QA_RERANK_LOG_FILE?.trim() || "./logs/wiki-qa-rerank.log", "info", fail);
      }
      const payload = entry.event === "input" ? { ...entry, requestBody: redactWikiQaLogText(entry.requestBody) }
        : entry.event === "output" ? { ...entry, output: redactWikiQaLogText(entry.output) } : entry;
      sink.info({ ...payload, layer: "adapter", module: "wiki-qa", stage: "adapter.wiki_qa.rerank" }, "WIKI_QA_RERANK_TRACE");
    } catch { fail(); }
  };
}

// The workflow service is created per request; share one rotating sink per process.
export const wikiQaRerankLog = createWikiQaRerankLog();
