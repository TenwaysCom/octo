import { z } from "zod";

export const githubBranchPreviewSchema = z.object({
  projectKey: z.string().min(1),
  workItemTypeKey: z.string().min(1),
  workItemId: z.string().min(1),
  masterUserId: z.string().min(1),
  baseUrl: z.string().min(1),
});

export const githubBranchCreateSchema = githubBranchPreviewSchema.extend({
  branchName: z.string().min(1).max(50),
});

export type GitHubBranchPreviewRequest = z.infer<typeof githubBranchPreviewSchema>;
export type GitHubBranchCreateRequest = z.infer<typeof githubBranchCreateSchema>;

export function validateGitHubBranchPreviewRequest(input: unknown): GitHubBranchPreviewRequest {
  return githubBranchPreviewSchema.parse(input);
}

export function validateGitHubBranchCreateRequest(input: unknown): GitHubBranchCreateRequest {
  return githubBranchCreateSchema.parse(input);
}
