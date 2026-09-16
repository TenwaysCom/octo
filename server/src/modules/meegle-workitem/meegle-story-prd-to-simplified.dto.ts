import { z } from "zod";

export const meegleStoryPrdToSimplifiedSchema = z.object({
  projectKey: z.string().min(1).optional(),
  workItemTypeKey: z.string().min(1).optional(),
  workItemId: z.string().min(1).optional(),
  meegleUrl: z.string().min(1).optional(),
  masterUserId: z.string().min(1),
  baseUrl: z.string().min(1),
  actionRunId: z.string().min(1).optional(),
}).refine(
  (input) =>
    Boolean(input.meegleUrl) ||
    Boolean(input.projectKey && input.workItemTypeKey && input.workItemId),
  {
    message: "Provide either meegleUrl or projectKey, workItemTypeKey, and workItemId.",
  },
);

export type MeegleStoryPrdToSimplifiedControllerRequest = z.infer<
  typeof meegleStoryPrdToSimplifiedSchema
>;

export function validateMeegleStoryPrdToSimplifiedRequest(
  input: unknown,
): MeegleStoryPrdToSimplifiedControllerRequest {
  return meegleStoryPrdToSimplifiedSchema.parse(input);
}
