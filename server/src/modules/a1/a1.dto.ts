import { z } from "zod";
import { executionDraftSchema } from "../../validators/agent-output/execution-draft";

export const a1RecordRequestSchema = z.object({
  recordId: z.string().min(1),
});

export const a1ApplyRequestSchema = z.object({
  draft: executionDraftSchema,
});

export type A1RecordRequest = z.infer<typeof a1RecordRequestSchema>;
export type A1ApplyRequest = z.infer<typeof a1ApplyRequestSchema>;

export function validateA1RecordRequest(input: unknown): A1RecordRequest {
  return a1RecordRequestSchema.parse(input);
}

export function validateA1ApplyRequest(input: unknown): A1ApplyRequest {
  return a1ApplyRequestSchema.parse(input);
}
