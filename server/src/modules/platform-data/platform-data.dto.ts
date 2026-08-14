import { z } from "zod";

export const platformDataListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(500),
  sprint: z.string().trim().min(1).max(200).optional(),
});

export type PlatformDataListQuery = z.infer<typeof platformDataListQuerySchema>;

const platformDataItemsSchema = z.object({
  items: z.array(z.unknown()),
});

const odooShBuildSchema = z.object({
  environment: z.enum(["eu", "uk", "us"]),
  status: z.string(),
  result: z.string(),
});

export const meegleWorkitemListResponseSchema = z.object({
  items: z.array(z.object({
    projectKey: z.string(),
    projectName: z.string().optional(),
    workItemTypeKey: z.string(),
    workItemId: z.string(),
    workItemKey: z.string().optional(),
    title: z.string(),
    workItemType: z.string().optional(),
    statusKey: z.string().optional(),
    status: z.string().optional(),
    subStageKey: z.string().optional(),
    subStage: z.string().optional(),
    sprint: z.string().optional(),
    version: z.string().optional(),
    system: z.string().optional(),
    bugs: z.array(z.string()).optional(),
    githubPullRequests: z.array(z.object({
      owner: z.string(),
      repo: z.string(),
      pullNumber: z.number().int().positive(),
      title: z.string(),
      htmlUrl: z.string().url(),
      headRef: z.string().optional(),
      baseRef: z.string().optional(),
      state: z.string(),
      odooShBuilds: z.array(odooShBuildSchema),
    })),
    assignee: z.string().optional(),
    sourceUpdatedAt: z.string().optional(),
    syncedAt: z.string(),
  })),
  sprints: z.array(z.string()),
});

export const githubPullRequestListResponseSchema = z.object({
  items: z.array(z.object({
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    htmlUrl: z.string().url(),
    authorLogin: z.string().optional(),
    mergedBy: z.string().optional(),
    reviewers: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    headRef: z.string().optional(),
    baseRef: z.string().optional(),
    isDraft: z.boolean(),
    meegleIds: z.array(z.string()),
    sourceUpdatedAt: z.string().optional(),
    syncedAt: z.string(),
    odooShBuilds: z.array(odooShBuildSchema),
  })),
});

export function parsePlatformDataListResponse(kind: "lark-tickets" | "meegle-workitems" | "github-pull-requests", data: unknown) {
  if (kind === "meegle-workitems") {
    return meegleWorkitemListResponseSchema.parse(data);
  }
  if (kind === "github-pull-requests") {
    return githubPullRequestListResponseSchema.parse(data);
  }
  return platformDataItemsSchema.parse(data);
}
