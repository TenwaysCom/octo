import { z } from "zod";

export const fieldValuePairSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.unknown(),
  label: z.string().min(1).optional(),
});

export const descriptionSectionSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

export const executionDraftSchema = z.object({
  draftType: z.enum(["b1", "b2"]),
  needConfirm: z.literal(true),
  sourceRecordId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  projectKey: z.string().min(1),
  workitemTypeKey: z.string().min(1),
  templateId: z.string().min(1),
  fieldValuePairs: z.array(fieldValuePairSchema).min(1),
  descriptionSections: z.array(descriptionSectionSchema).default([]),
});

export type ExecutionDraft = z.infer<typeof executionDraftSchema>;

export function validateExecutionDraft(input: unknown): ExecutionDraft {
  return executionDraftSchema.parse(input);
}
