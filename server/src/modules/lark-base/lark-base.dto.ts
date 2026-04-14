import { z } from "zod";

export const updateLarkBaseMeegleLinkSchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  recordId: z.string().min(1),
  meegleLink: z.string().min(1),
  masterUserId: z.string().min(1),
});

export type UpdateLarkBaseMeegleLinkRequest = z.infer<
  typeof updateLarkBaseMeegleLinkSchema
>;

export function validateUpdateLarkBaseMeegleLinkRequest(
  input: unknown,
): UpdateLarkBaseMeegleLinkRequest {
  return updateLarkBaseMeegleLinkSchema.parse(input);
}
