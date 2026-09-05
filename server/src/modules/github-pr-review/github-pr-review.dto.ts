import { z } from "zod";

export const githubPrReviewSchema = z.object({
  prUrl: z.string().url(),
  masterUserId: z.string().min(1),
  actionRunId: z.string().min(1).optional(),
  operation: z.enum(["github.pr.quick_scan", "github.pr.deep_review"]),
});

export type GitHubPrReviewRequest = z.infer<typeof githubPrReviewSchema>;

export const githubPrReviewStatusSchema = z.object({
  actionRunId: z.string().min(1),
  masterUserId: z.string().min(1),
});

export type GitHubPrReviewStatusRequest = z.infer<typeof githubPrReviewStatusSchema>;

export function validateGitHubPrReviewRequest(input: unknown): GitHubPrReviewRequest {
  return githubPrReviewSchema.parse(input);
}

export function validateGitHubPrReviewStatusRequest(input: unknown): GitHubPrReviewStatusRequest {
  return githubPrReviewStatusSchema.parse(input);
}

export const githubPrCodeReviewFeedbackSchema = z.object({
  prUrl: z.string().url(),
  masterUserId: z.string().min(1),
  actionRunId: z.string().min(1).optional(),
  operation: z.literal("github.pr.code_review_feedback"),
});

export type GitHubPrCodeReviewFeedbackRequest = z.infer<typeof githubPrCodeReviewFeedbackSchema>;

export function validateGitHubPrCodeReviewFeedbackRequest(input: unknown): GitHubPrCodeReviewFeedbackRequest {
  return githubPrCodeReviewFeedbackSchema.parse(input);
}
