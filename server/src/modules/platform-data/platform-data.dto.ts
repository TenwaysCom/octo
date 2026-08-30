import { z } from "zod";

const timestampQuerySchema = z.string().trim().min(1).max(80)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected an ISO-8601 timestamp.")
  .transform((value) => new Date(value).toISOString());

const stringListQuerySchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => typeof item === "string" ? item.split(",") : [item]);
}, z.array(z.string().trim().min(1).max(200)).min(1).max(50).optional())
  .transform((values) => values && [...new Set(values)]);

export const platformDataListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(500),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  status: stringListQuerySchema,
  sprint: stringListQuerySchema,
  project: stringListQuerySchema,
  priority: stringListQuerySchema,
  responsible: stringListQuerySchema,
  workitemType: stringListQuerySchema,
  quickFilter: z.enum(["in-progress", "unclassified", "unsynced"]).optional(),
  withoutSprint: z.enum(["true"]).optional().transform((value) => value === "true"),
  createdAfter: timestampQuerySchema.optional(),
  createdBefore: timestampQuerySchema.optional(),
  sourceUpdatedAtAfter: timestampQuerySchema.optional(),
  sourceUpdatedAtBefore: timestampQuerySchema.optional(),
  issueType: stringListQuerySchema,
  repo: stringListQuerySchema,
  label: stringListQuerySchema,
  reviewer: stringListQuerySchema,
}).superRefine((value, context) => {
  if (value.createdAfter && value.createdBefore && value.createdAfter > value.createdBefore) {
    context.addIssue({ code: "custom", message: "createdAfter must not be later than createdBefore.", path: ["createdAfter"] });
  }
  if (value.sourceUpdatedAtAfter && value.sourceUpdatedAtBefore && value.sourceUpdatedAtAfter > value.sourceUpdatedAtBefore) {
    context.addIssue({ code: "custom", message: "sourceUpdatedAtAfter must not be later than sourceUpdatedAtBefore.", path: ["sourceUpdatedAtAfter"] });
  }
});

export type PlatformDataListQuery = z.infer<typeof platformDataListQuerySchema>;

export const githubPullRequestPreviewQuerySchema = z.object({
  owner: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  repo: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  pullNumber: z.coerce.number().int().positive(),
});

const platformDataPagerSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative().optional(),
});

const platformDataItemsSchema = z.object({
  items: z.array(z.unknown()),
  pager: platformDataPagerSchema,
});

const odooShBuildSchema = z.object({
  environment: z.enum(["eu", "uk", "us"]),
  status: z.string(),
  result: z.string(),
});

const githubLinkedMeegleWorkitemSchema = z.object({
  projectKey: z.string(),
  projectName: z.string().optional(),
  workItemTypeKey: z.string(),
  workItemId: z.string(),
  workItemKey: z.string().optional(),
  title: z.string(),
  workItemType: z.string().optional(),
  status: z.string().optional(),
  sprint: z.string().optional(),
  version: z.string().optional(),
});

const meegleWorkitemSchema = z.object({
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
  sprintId: z.string().optional(),
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
  priority: z.string().optional(),
  addToCycleTime: z.string().datetime().optional(),
  currentNodeStartTime: z.string().datetime().optional(),
  itemStartTime: z.string().datetime().optional(),
  itemFinishTime: z.string().datetime().optional(),
  sourceUpdatedAt: z.string().optional(),
  syncedAt: z.string(),
});

const meegleSprintDetailsSchema = z.array(z.object({
    projectKey: z.string(),
    projectName: z.string().optional(),
    sprintId: z.string(),
    name: z.string(),
    statusKey: z.string().optional(),
    status: z.string().optional(),
    description: z.string().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    sourceUpdatedAt: z.string().datetime().optional(),
    syncedAt: z.string().datetime(),
  }));

const meegleSprintWorkitemsSchema = z.array(meegleWorkitemSchema.extend({
    sprintId: z.string(),
    sprint: z.string(),
    membershipRemovedAt: z.string().datetime().optional(),
    membershipSource: z.enum(["historical_inferred", "incremental_observed"]),
    carryoverToSprintId: z.string().optional(),
    carryoverToSprintName: z.string().optional(),
  }));

export const meegleWorkitemListResponseSchema = z.object({
  items: z.array(meegleWorkitemSchema),
  sprints: z.array(z.string()),
  pager: platformDataPagerSchema,
});

export const meegleSprintHistoryResponseSchema = z.object({
  sprintDetails: meegleSprintDetailsSchema,
  sprintWorkitems: meegleSprintWorkitemsSchema,
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
  pager: platformDataPagerSchema,
});

export const githubPullRequestPreviewResponseSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional(),
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
  meegleWorkitems: z.array(githubLinkedMeegleWorkitemSchema),
  sourceUpdatedAt: z.string().optional(),
  syncedAt: z.string(),
  odooShBuilds: z.array(odooShBuildSchema),
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
