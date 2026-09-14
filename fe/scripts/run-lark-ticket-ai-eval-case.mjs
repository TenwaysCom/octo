import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { summarizeAiSessionForEval } from "../src/lib/ai-session-eval.js";
import { streamLarkTicketAiSession } from "../src/services/lark-ticket-ai/lark-ticket-ai-api.js";

const [datasetPath, caseId] = process.argv.slice(2);

if (!datasetPath || !caseId) {
  fail("Usage: node fe/scripts/run-lark-ticket-ai-eval-case.mjs <dataset.csv> <case-id>");
}

const apiBaseUrl = requiredEnv("OCTO_EVAL_API_BASE_URL");
const webSessionCookie = requiredEnv("OCTO_EVAL_WEB_SESSION_COOKIE");
const testCase = readEvalCases(await readFile(datasetPath, "utf8"), datasetPath)
  .find((candidate) => candidate.id === caseId);

if (!testCase) fail(`Eval case ${caseId} was not found in ${datasetPath}.`);
if (testCase.enabled !== true && process.env.OCTO_EVAL_ALLOW_DISABLED !== "1") {
  fail(`Eval case ${caseId} is disabled. Enable it only after configuring an isolated Ticket fixture.`);
}

const events = [];
const startedAt = performance.now();
try {
  await streamLarkTicketAiSession({
    apiBaseUrl,
    ticket: {
      baseId: testCase.ticket.base_id,
      tableId: testCase.ticket.table_id,
      recordId: testCase.ticket.record_id,
    },
    message: testCase.message,
    actionKey: testCase.action_key,
    actionRunId: `eval-${testCase.id}-${randomUUID()}`,
    onEvent: (event) => events.push(event),
    fetchImpl: (url, options = {}) => fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Cookie: webSessionCookie,
      },
    }),
  });
  process.stdout.write(`${JSON.stringify({
    caseId: testCase.id,
    actionKey: testCase.action_key,
    latencyMs: Math.round(performance.now() - startedAt),
    ...summarizeAiSessionForEval(events),
  })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    caseId: testCase.id,
    actionKey: testCase.action_key,
    latencyMs: Math.round(performance.now() - startedAt),
    errorCode: error && typeof error === "object" && "code" in error ? error.code : "AI_EVAL_ACTION_FAILED",
    errorMessage: error instanceof Error ? error.message : String(error),
    output: "",
    toolCalls: [],
    stopReason: null,
    eventCount: events.length,
  })}\n`);
  process.exitCode = 1;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required. Its value is never written to the eval dataset or report.`);
  return value;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function readEvalCases(text, source) {
  const [header, ...rows] = parseCsv(text);
  const requiredColumns = ["id", "enabled", "action_key", "base_id", "table_id", "record_id", "message"];
  if (!header || requiredColumns.some((column) => !header.includes(column))) {
    fail(`${source} is missing a required eval CSV column.`);
  }
  return rows.filter((row) => row.some(Boolean)).map((row, index) => {
    const value = Object.fromEntries(header.map((column, columnIndex) => [column, row[columnIndex] ?? ""]));
    if (!requiredColumns.every((column) => value[column].trim())) {
      fail(`${source} row ${index + 2} is missing a required value.`);
    }
    if (value.enabled !== "true" && value.enabled !== "false") {
      fail(`${source} row ${index + 2} has invalid enabled value; use true or false.`);
    }
    return {
      id: value.id.trim(),
      enabled: value.enabled === "true",
      action_key: value.action_key.trim(),
      ticket: { base_id: value.base_id.trim(), table_id: value.table_id.trim(), record_id: value.record_id.trim() },
      message: value.message.trim(),
    };
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) fail("Eval CSV contains an unclosed quoted field.");
  if (value || row.length) rows.push([...row, value]);
  return rows;
}
