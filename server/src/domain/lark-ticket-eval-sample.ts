import { z } from "zod";

export const LARK_TICKET_EVAL_STATUSES = ["draft", "eval", "badcase"] as const;
export const LARK_TICKET_FAILURE_LABELS = [
  "intent_incorrect", "fact_incorrect", "missing_evidence", "risk_missed", "action_incorrect", "answer_unusable",
] as const;

const shortText = z.string().trim().min(1).max(240);
const optionalText = z.string().trim().max(4000).optional().nullable();

export const createLarkTicketEvalSampleSchema = z.object({
  baseId: shortText,
  tableId: shortText,
  actionRunId: z.string().trim().min(1).max(128),
}).strict();

export const updateLarkTicketEvalSampleSchema = z.object({
  actionRunId: z.string().trim().min(1).max(128),
  datasetStatus: z.enum(LARK_TICKET_EVAL_STATUSES),
  manualIntent: optionalText,
  expectedOutcome: optionalText,
  notes: optionalText,
  failureLabels: z.array(z.enum(LARK_TICKET_FAILURE_LABELS)).max(LARK_TICKET_FAILURE_LABELS.length).default([])
    .refine((values) => new Set(values).size === values.length, "Failure labels must be unique."),
}).strict().superRefine((value, context) => {
  if (value.datasetStatus !== "draft" && (!value.manualIntent || !value.expectedOutcome)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Eval samples require manualIntent and expectedOutcome." });
  }
  if (value.datasetStatus === "badcase" && value.failureLabels.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Badcase samples require at least one failure label." });
  }
});

export type LarkTicketEvalSampleUpdate = z.infer<typeof updateLarkTicketEvalSampleSchema>;
