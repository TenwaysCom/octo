import { z } from "zod";

export const githubPrOdooDevopsBuildQuerySchema = z.object({
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
  pullNumber: z.coerce.number().int().positive(),
});

export const githubPrOdooDevopsBuildResponseSchema = z.object({
  environment: z.enum(["eu", "uk", "us"]),
  headRef: z.string(),
  build: z.object({
    branch: z.string(),
    status: z.string(),
    result: z.string(),
  }).nullable(),
});

export type GitHubPrOdooDevopsBuildResponse = z.infer<typeof githubPrOdooDevopsBuildResponseSchema>;
