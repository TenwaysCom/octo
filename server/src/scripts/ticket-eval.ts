import { DEFAULT_SHADOW_SUMMARY_PROMPT, SHADOW_SUMMARY_PROMPT_KEY } from "../domain/shadow-summary-prompt.js";
/** Local JSON protocol. No HTTP server, auth sessions, synchronization or business writes. */
import { z } from "zod";
import { executeTicketEval, ticketEvalRequestSchema } from "../application/services/ticket-eval.service.js";
import { exportTicketEvalRows } from "../adapters/postgres/ticket-eval-export.js";
import { DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS, WIKI_QA_PROMPTS } from "../domain/workflow-prompts.js";

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const request: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const envelope = z.object({ operation: z.enum(["export", "run", "defaults"]), data: z.unknown() }).strict().parse(request);
  if (envelope.operation === "defaults") return { prompts: {
    ...DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS,
    [SHADOW_SUMMARY_PROMPT_KEY]: DEFAULT_SHADOW_SUMMARY_PROMPT,
    ...Object.fromEntries(Object.values(WIKI_QA_PROMPTS).map((spec) => [spec.key, spec.prompt])),
  } };
  if (envelope.operation === "export") {
    const data = z.object({ baseId: z.string().min(1), tableId: z.string().min(1), limit: z.number().int().positive().max(100000) }).strict().parse(envelope.data);
    const connectionString = process.env.POSTGRES_URI || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("EVAL_DATABASE_NOT_CONFIGURED");
    return await exportTicketEvalRows({ ...data, connectionString });
  }
  const data = ticketEvalRequestSchema.parse(envelope.data);
  // These settings are part of the frozen config, not ambient process defaults.
  process.env.WIKI_QA_RERANK_MIN_SCORE = String(data.config.rerank?.minScore ?? 0.7);
  process.env.WIKI_QA_ANSWER_REASONING_EFFORT = "low";
  return await executeTicketEval(data);
}
main().then((data) => process.stdout.write(JSON.stringify({ ok: true, data }))).catch(() => {
  process.stdout.write(JSON.stringify({ ok: false, error: { errorCode: "EVAL_BRIDGE_FAILED", layer: "server", module: "ticket-eval", stage: "request" } }));
  process.exitCode = 1;
});
