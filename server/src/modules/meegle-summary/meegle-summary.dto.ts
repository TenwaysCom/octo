import { z } from "zod";

export const generateSummaryRequestSchema = z.object({
  projectKey: z.string().min(1),
  workItemTypeKey: z.string().min(1),
  workItemId: z.string().min(1),
  masterUserId: z.string().min(1),
  baseUrl: z.string().min(1),
  larkBaseUrl: z.string().optional(),
});

export type GenerateSummaryRequest = z.infer<typeof generateSummaryRequestSchema>;

export function validateGenerateSummaryRequest(input: unknown): GenerateSummaryRequest {
  return generateSummaryRequestSchema.parse(input);
}

export const applySummaryRequestSchema = z.object({
  projectKey: z.string().min(1),
  workItemTypeKey: z.string().min(1),
  workItemId: z.string().min(1),
  masterUserId: z.string().min(1),
  baseUrl: z.string().min(1),
  generatedSummary: z.string().min(1),
  statusSummary: z.string().min(1),
});

export type ApplySummaryRequest = z.infer<typeof applySummaryRequestSchema>;

export function validateApplySummaryRequest(input: unknown): ApplySummaryRequest {
  return applySummaryRequestSchema.parse(input);
}
