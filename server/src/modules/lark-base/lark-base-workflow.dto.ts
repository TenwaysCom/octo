import { z } from "zod";

export const createLarkBaseWorkflowSchema = z.object({
  recordId: z.string().min(1),
  masterUserId: z.string().min(1),
  baseId: z.string().optional(),
  tableId: z.string().optional(),
  projectKey: z.string().optional(),
});

export type CreateLarkBaseWorkflowRequest = z.infer<
  typeof createLarkBaseWorkflowSchema
>;

export function validateCreateLarkBaseWorkflowRequest(
  input: unknown,
): CreateLarkBaseWorkflowRequest {
  return createLarkBaseWorkflowSchema.parse(input);
}
