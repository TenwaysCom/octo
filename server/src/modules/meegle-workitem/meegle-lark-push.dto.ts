import { z } from "zod";

export const meegleLarkPushSchema = z.object({
  projectKey: z.string().min(1),
  workItemTypeKey: z.string().min(1),
  workItemId: z.string().min(1),
  masterUserId: z.string().min(1),
  baseUrl: z.string().min(1),
  larkBaseUrl: z.string().optional(),
  larkStatusFieldName: z.string().optional(),
});

export type MeegleLarkPushControllerRequest = z.infer<typeof meegleLarkPushSchema>;

export function validateMeegleLarkPushRequest(input: unknown): MeegleLarkPushControllerRequest {
  return meegleLarkPushSchema.parse(input);
}
