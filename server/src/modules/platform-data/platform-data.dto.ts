import { z } from "zod";

export const platformDataListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  sprint: z.string().trim().min(1).max(200).optional(),
});

export type PlatformDataListQuery = z.infer<typeof platformDataListQuerySchema>;

const platformDataItemsSchema = z.object({
  items: z.array(z.unknown()),
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
      baseRef: z.string().optional(),
      state: z.string(),
    })),
    assignee: z.string().optional(),
    sourceUpdatedAt: z.string().optional(),
    syncedAt: z.string(),
  })),
  sprints: z.array(z.string()),
});

export function parsePlatformDataListResponse(kind: "lark-tickets" | "meegle-workitems" | "github-pull-requests", data: unknown) {
  if (kind === "meegle-workitems") {
    return meegleWorkitemListResponseSchema.parse(data);
  }
  return platformDataItemsSchema.parse(data);
}
