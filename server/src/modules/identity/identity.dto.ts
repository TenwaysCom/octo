import { z } from "zod";

export const identityResolveRequestSchema = z.object({
  requestId: z.string().min(1),
  operatorLarkId: z.string().min(1),
  meegleUserKey: z.string().min(1).optional(),
  githubId: z.string().min(1).optional(),
  pageContext: z.object({
    platform: z.enum(["lark", "meegle", "github", "unknown"]),
    baseUrl: z.string().url(),
    pathname: z.string().min(1),
  }),
});

export type IdentityResolveRequest = z.infer<typeof identityResolveRequestSchema>;

export function validateIdentityResolveRequest(
  input: unknown,
): IdentityResolveRequest {
  return identityResolveRequestSchema.parse(input);
}
