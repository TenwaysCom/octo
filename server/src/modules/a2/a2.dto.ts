import { z } from "zod";
import { executionDraftSchema } from "../../validators/agent-output/execution-draft";

export const a2RecordRequestSchema = z.object({
  recordId: z.string().min(1),
});

export const a2ApplyRequestSchema = z.object({
  draft: executionDraftSchema,
});

export type A2RecordRequest = z.infer<typeof a2RecordRequestSchema>;
export type A2ApplyRequest = z.infer<typeof a2ApplyRequestSchema>;

export function validateA2RecordRequest(input: unknown): A2RecordRequest {
  return a2RecordRequestSchema.parse(input);
}

export function validateA2ApplyRequest(input: unknown): A2ApplyRequest {
  return a2ApplyRequestSchema.parse(input);
}
