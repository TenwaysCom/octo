import { z } from "zod";
import { pickLarkTicketAiFields } from "./lark-ticket-ai.js";

const identityFields = {
  baseId: z.string().trim().min(1).max(128),
  tableId: z.string().trim().min(1).max(128),
  recordId: z.string().trim().min(1).max(128),
  ticketNumber: z.string().trim().min(1).max(128),
  snapshotVersion: z.number().int().positive(),
  actionRunId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
};

export const supportQaAnswerFeedbackDraftSchema = z.object({
  version: z.literal("support-qa-answer-feedback-draft-v1"),
  effectType: z.literal("answer_feedback"),
  ...identityFields,
  feedback: z.object({
    correct: z.boolean(),
    issueSummary: z.string().trim().min(1).max(2000),
    answerSummary: z.string().trim().min(1).max(2000),
    errorCategories: z.array(z.enum(["参考文档不对", "信息不足", "归因错误"])).max(3).default([]),
    errorExplanation: z.string().trim().max(2000).default(""),
  }).strict().superRefine((feedback, context) => {
    if (!feedback.correct && (!feedback.errorCategories.length || !feedback.errorExplanation)) {
      context.addIssue({ code: "custom", message: "Rejected feedback requires a category and explanation." });
    }
    if (feedback.correct && (feedback.errorCategories.length || feedback.errorExplanation)) {
      context.addIssue({ code: "custom", message: "Accepted feedback must not include error details." });
    }
  }),
}).strict();

export const supportQaTicketAiDraftSchema = z.object({
  version: z.literal("support-qa-ticket-ai-draft-v1"),
  effectType: z.literal("ticket_ai_update"),
  ...identityFields,
  fields: z.record(z.string(), z.unknown()).refine(
    (fields) => Object.keys(pickLarkTicketAiFields(fields)).length > 0,
    "Draft does not contain a supported Ticket AI field.",
  ),
  indexEntry: z.object({
    record_id: z.string().trim().min(1).max(128),
  }).strict(),
}).strict().superRefine((draft, context) => {
  if (draft.indexEntry.record_id !== draft.recordId) {
    context.addIssue({ code: "custom", path: ["indexEntry", "record_id"], message: "Index entry record_id must match the Ticket." });
  }
});

export const supportTicketEffectDraftSchema = z.discriminatedUnion("effectType", [
  supportQaAnswerFeedbackDraftSchema,
  supportQaTicketAiDraftSchema,
]);

export type SupportTicketEffectDraftPayload = z.infer<typeof supportTicketEffectDraftSchema>;
