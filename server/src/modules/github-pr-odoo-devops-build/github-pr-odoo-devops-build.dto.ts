import { z } from "zod";

export const githubPrOdooDevopsBuildQuerySchema = z.object({
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
  pullNumber: z.coerce.number().int().positive(),
  headRef: z.string().trim().min(1).max(500).optional(),
});

export const githubPrOdooDevopsBuildResponseSchema = z.object({
  state: z.enum(["ready", "refreshing"]),
  environment: z.enum(["eu", "uk", "us"]),
  headRef: z.string(),
  build: z.object({
    branch: z.string(),
    status: z.string(),
    result: z.string(),
  }).nullable(),
  stale: z.boolean().optional(),
  retryAfterMs: z.number().int().positive().optional(),
});

export type GitHubPrOdooDevopsBuildResponse = z.infer<typeof githubPrOdooDevopsBuildResponseSchema>;
