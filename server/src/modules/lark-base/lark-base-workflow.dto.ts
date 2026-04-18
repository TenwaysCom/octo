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

export const previewLarkBaseBulkWorkflowSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().min(1),
  masterUserId: z.string().min(1),
});

export type PreviewLarkBaseBulkWorkflowRequest = z.infer<
  typeof previewLarkBaseBulkWorkflowSchema
>;

export const createLarkBaseBulkWorkflowSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().min(1),
  masterUserId: z.string().min(1),
});

export type CreateLarkBaseBulkWorkflowRequest = z.infer<
  typeof createLarkBaseBulkWorkflowSchema
>;

export function validateCreateLarkBaseWorkflowRequest(
  input: unknown,
): CreateLarkBaseWorkflowRequest {
  return createLarkBaseWorkflowSchema.parse(input);
}

export function validatePreviewLarkBaseBulkWorkflowRequest(
  input: unknown,
): PreviewLarkBaseBulkWorkflowRequest {
  return previewLarkBaseBulkWorkflowSchema.parse(input);
}

export function validateCreateLarkBaseBulkWorkflowRequest(
  input: unknown,
): CreateLarkBaseBulkWorkflowRequest {
  return createLarkBaseBulkWorkflowSchema.parse(input);
}
