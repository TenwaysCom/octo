import { createFileLogger, logger } from "../../logger.js";
import { redactSupportText } from "../../domain/support-ticket-analysis.js";

export type WikiQaExtractEvent = { actionRunId: string; durationMs?: number } & (
  | { event: "input"; prompt: string }
  | { event: "output"; model: string; output: string; valid: boolean }
  | { event: "failed"; errorCode: string }
);
export type WikiQaExtractLog = (event: WikiQaExtractEvent) => void;

// Pino's key redaction cannot inspect credentials embedded inside prompt strings.
export function redactWikiQaLogText(text: string): string {
  return redactSupportText(text)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [Redacted]")
    .replace(/((?:["']?)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|cookie|auth[_-]?code)(?:["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\r\n]+)/gi, "$1[Redacted]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[Redacted]@");
}

export function createWikiQaExtractLog(deps: {
  env?: NodeJS.ProcessEnv;
  createLogger?: typeof createFileLogger;
} = {}): WikiQaExtractLog {
  const env = deps.env ?? process.env;
  let sink: ReturnType<typeof createFileLogger> | undefined;
  let failed = false;
  const fail = () => {
    if (!failed) logger.warn({ layer: "adapter", module: "wiki-qa-extract-log", stage: "adapter.wiki_qa.extract_log", errorCode: "WIKI_QA_EXTRACT_LOG_FAILED" }, "WIKI_QA_EXTRACT_LOG_FAILED");
    failed = true;
  };
  return (entry) => {
    if (env.WIKI_QA_EXTRACT_LOG_ENABLED?.trim().toLowerCase() !== "true" || failed) return;
    try {
      if (!sink) {
        sink = (deps.createLogger ?? createFileLogger)(env.WIKI_QA_EXTRACT_LOG_FILE?.trim() || "./logs/wiki-qa-extract.log", "info", fail);
      }
      const payload = entry.event === "input" ? { ...entry, prompt: redactWikiQaLogText(entry.prompt) }
        : entry.event === "output" ? { ...entry, output: redactWikiQaLogText(entry.output) } : entry;
      sink.info({ ...payload, layer: "server", module: "wiki-qa", stage: "server.wiki_qa.extract" }, "WIKI_QA_EXTRACT_TRACE");
    } catch { fail(); }
  };
}

// The workflow service is created per request; share one rotating sink per process.
export const wikiQaExtractLog = createWikiQaExtractLog();
