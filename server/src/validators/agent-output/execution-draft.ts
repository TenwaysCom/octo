import { z } from "zod";

export const fieldValuePairSchema = z.object({
  fieldKey: z.string().min(1),
  fieldValue: z.unknown(),
});

export const sourceRefSchema = z.object({
  sourcePlatform: z.enum(["lark_base"]),
  sourceRecordId: z.string().min(1),
});

export const draftTargetSchema = z.object({
  projectKey: z.string().min(1),
  workitemTypeKey: z.string().min(1),
  templateId: z.union([z.string().min(1), z.number().int()]),
});

export const executionDraftSchema = z.object({
  draftId: z.string().min(1),
  draftType: z.enum(["b1", "b2"]),
  sourceRef: sourceRefSchema,
  target: draftTargetSchema,
  name: z.string().min(1),
  needConfirm: z.literal(true),
  fieldValuePairs: z.array(fieldValuePairSchema).min(1),
  ownerUserKeys: z.array(z.string().min(1)).default([]),
  missingMeta: z.array(z.string().min(1)).default([]),
});

export type ExecutionDraft = z.infer<typeof executionDraftSchema>;

export function validateExecutionDraft(input: unknown): ExecutionDraft {
  return executionDraftSchema.parse(input);
}
