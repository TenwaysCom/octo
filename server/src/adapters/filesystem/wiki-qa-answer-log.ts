import { createFileLogger, logger } from "../../logger.js";
import { redactWikiQaLogText } from "./wiki-qa-extract-log.js";

export type WikiQaAnswerEvent = { actionRunId: string; durationMs?: number; diagnostics?: import("../ai/json-completion-client.js").CompletionDiagnostics } & (
  | { event: "input"; prompt: string }
  | { event: "output"; model: string; output: string; valid: boolean }
  | { event: "failed"; errorCode: string }
);
export type WikiQaAnswerLog = (event: WikiQaAnswerEvent) => void;

export function createWikiQaAnswerLog(deps: {
  env?: NodeJS.ProcessEnv;
  createLogger?: typeof createFileLogger;
} = {}): WikiQaAnswerLog {
  const env = deps.env ?? process.env;
  let sink: ReturnType<typeof createFileLogger> | undefined;
  let failed = false;
  const fail = () => {
    if (!failed) logger.warn({ layer: "adapter", module: "wiki-qa-answer-log", stage: "adapter.wiki_qa.answer_log", errorCode: "WIKI_QA_ANSWER_LOG_FAILED" }, "WIKI_QA_ANSWER_LOG_FAILED");
    failed = true;
  };
  return (entry) => {
    if (env.WIKI_QA_ANSWER_LOG_ENABLED?.trim().toLowerCase() !== "true" || failed) return;
    try {
      if (!sink) {
        sink = (deps.createLogger ?? createFileLogger)(env.WIKI_QA_ANSWER_LOG_FILE?.trim() || "./logs/wiki-qa-answer.log", "info", fail);
      }
      const payload = entry.event === "input" ? { ...entry, promptChars: entry.prompt.length, prompt: redactWikiQaLogText(entry.prompt) }
        : entry.event === "output" ? { ...entry, outputChars: entry.output.length, output: redactWikiQaLogText(entry.output) } : entry;
      sink.info({ ...payload, layer: "server", module: "wiki-qa", stage: "server.wiki_qa.answer" }, "WIKI_QA_ANSWER_TRACE");
    } catch { fail(); }
  };
}

// The workflow service is created per request; share one rotating sink per process.
export const wikiQaAnswerLog = createWikiQaAnswerLog();
