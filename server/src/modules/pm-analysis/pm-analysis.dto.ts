import { z } from "zod";

export const pmAnalysisRequestSchema = z.object({
  projectKeys: z.array(z.string().min(1)).min(1),
  timeWindowDays: z.number().int().positive().default(14).optional(),
  masterUserId: z.string().optional(),
  baseUrl: z.string().optional(),
});

export type PMAnalysisRequest = z.infer<typeof pmAnalysisRequestSchema>;

export function validatePMAnalysisRequest(input: unknown): PMAnalysisRequest {
  return pmAnalysisRequestSchema.parse(input);
}
