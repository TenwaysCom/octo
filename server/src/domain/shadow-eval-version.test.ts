import { shadowEvalVersion } from "./shadow-eval-version.js";
import { parseLarkTicketShadowAi } from "./lark-ticket-ai.js";
import { createShadowEvalSampleSchema, updateLarkTicketEvalSampleSchema } from "./lark-ticket-eval-sample.js";

it("identifies each public Shadow result independently of object order or a supplied version", () => {
  const output = { status: "ok", snapshotVersion: 2, analyzedAt: "2026-10-21T01:00:00Z", summary: "旧结果" };
  expect(shadowEvalVersion({ ...output, evalVersion: "forged" })).toBe(shadowEvalVersion({ summary: "旧结果", analyzedAt: output.analyzedAt, snapshotVersion: 2, status: "ok" }));
  expect(shadowEvalVersion({ ...output, analyzedAt: "2026-10-21T02:00:00Z" })).not.toBe(shadowEvalVersion(output));
  expect(shadowEvalVersion({ ...output, summary: "新结果" })).not.toBe(shadowEvalVersion(output));
});

it("never freezes private Wiki evidence or lets it change the public result identity", () => {
  const input = { status: "ok", snapshotVersion: 2, summary: "问题", analyzedAt: "2026-10-21T01:00:00Z" };
  const first = parseLarkTicketShadowAi(JSON.stringify({ ...input, wikiEvidence: "PRIVATE", evalVersion: "forged" }))!;
  const second = parseLarkTicketShadowAi(JSON.stringify({ ...input, wikiEvidence: "CHANGED" }))!;
  expect(first).toEqual(second);
  expect(JSON.stringify(first)).not.toContain("PRIVATE");
  expect(first.evalVersion).toBe(shadowEvalVersion(first));
});

it("validates atomic Shadow annotation and requires a revision on every edit", () => {
  const base = { baseId: "b", tableId: "t", outputVersion: "a".repeat(64), actionRunId: "run", datasetStatus: "eval" };
  expect(createShadowEvalSampleSchema.safeParse(base).success).toBe(true);
  expect(createShadowEvalSampleSchema.safeParse({ ...base, datasetStatus: "badcase", failureLabels: ["fact_incorrect"], notes: "  " }).success).toBe(false);
  expect(createShadowEvalSampleSchema.safeParse({ ...base, datasetStatus: "badcase", failureLabels: ["fact_incorrect"], notes: "环境错误" }).success).toBe(true);
  expect(createShadowEvalSampleSchema.safeParse({ ...base, reviewerId: "forged" }).success).toBe(false);
  expect(updateLarkTicketEvalSampleSchema.safeParse({ actionRunId: "run", datasetStatus: "eval" }).success).toBe(false);
});
