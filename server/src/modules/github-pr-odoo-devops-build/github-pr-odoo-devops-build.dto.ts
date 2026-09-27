import { z } from "zod";

export const githubPrOdooDevopsBuildQuerySchema = z.object({
  all: z.never().optional(),
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
  pullNumber: z.coerce.number().int().positive(),
  headRef: z.string().trim().min(1).max(500).optional(),
});

export const allGitHubPrOdooDevopsBuildQuerySchema = z.object({
  all: z.literal("true"),
  actionRunId: z.string().trim().min(1).max(100),
}).strict();

export const allGitHubPrOdooDevopsBuildResponseSchema = z.object({
  actionRunId: z.string(),
  environments: z.array(z.object({
    environment: z.enum(["eu", "uk", "us"]),
    state: z.enum(["ready", "unavailable"]),
    stale: z.boolean(),
    builds: z.array(z.object({ branch: z.string(), status: z.string(), result: z.string() })),
    error: z.object({
      layer: z.literal("server"),
      module: z.literal("odoo-devops-branches"),
      stage: z.literal("server.builds.read.failed"),
      errorCode: z.literal("ODOO_DEVOPS_UNAVAILABLE"),
    }).optional(),
  })).length(3),
});

export type AllGitHubPrOdooDevopsBuildResponse = z.infer<typeof allGitHubPrOdooDevopsBuildResponseSchema>;

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
