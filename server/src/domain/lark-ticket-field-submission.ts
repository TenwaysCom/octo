import { z } from "zod";

export const editableTicketFields = ["status", "priority", "requester", "responsible", "issueType", "businessLine"] as const;
export type EditableTicketField = typeof editableTicketFields[number];
export const ticketFieldKeys = { status: "ticketStatus", priority: "priority", requester: "requester", responsible: "responsible", issueType: "issueType", businessLine: "businessLine" } as const;
export const isPersonField = (field: string) => field === "requester" || field === "responsible";
const reference = z.string().trim().min(1).max(240);
const fieldValue = z.object({ value: z.string().max(512), userIds: z.array(reference).max(50).optional() }).strict();
const change = z.object({
  field: z.enum(editableTicketFields), value: z.string().trim().min(1).max(512),
  optionUserId: z.string().trim().regex(/^ou_[A-Za-z0-9_-]+$/).max(128).optional(), expected: fieldValue,
}).strict().superRefine((input, ctx) => {
  if (isPersonField(input.field) && !input.optionUserId) ctx.addIssue({ code: "custom", path: ["optionUserId"], message: "人员修改需要 open ID。" });
});
export const ticketSubmissionReferenceSchema = z.object({ baseId: reference, tableId: reference, expectedUserId: reference }).strict();
export const ticketFieldSubmissionSchema = ticketSubmissionReferenceSchema.extend({
  submissionId: z.string().uuid(), actionRunId: z.string().trim().min(1).max(128), changes: z.array(change).min(1).max(6),
}).strict().refine(({ changes }) => new Set(changes.map((item) => item.field)).size === changes.length, "字段不可重复。");
export type TicketFieldChange = z.infer<typeof change>;
export type TicketFieldValue = z.infer<typeof fieldValue>;
export type TicketFieldValues = Record<EditableTicketField, TicketFieldValue>;
export type TicketSubmissionState = "preparing" | "writing" | "unknown" | "saved_pending_sync" | "saved" | "rejected" | "conflict" | "not_applied";
export interface TicketSubmissionResult {
  submissionId: string; actionRunId: string; state: TicketSubmissionState;
  layer: "server"; module: string; stage: string;
  larkBaseUpdated: boolean; syncFailed: boolean;
  values?: TicketFieldValues; ticket?: Record<string, unknown>; conflicts?: EditableTicketField[];
  errorCode?: string; errorMessage?: string;
}
export function sameTicketFieldValue(field: EditableTicketField, left: TicketFieldValue, right: TicketFieldValue): boolean {
  if (isPersonField(field) && left.userIds && right.userIds) return JSON.stringify([...left.userIds].sort()) === JSON.stringify([...right.userIds].sort());
  return left.value === right.value;
}
