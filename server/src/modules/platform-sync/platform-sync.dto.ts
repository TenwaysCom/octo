import { z } from "zod";

const actionRunId = z.string().min(1).optional();
const larkTicketFields = z.object({
  titleFieldName: z.string().min(1).optional(),
  statusFieldName: z.string().min(1).optional(),
});

export const syncMeegleWorkitemSchema = z.object({
  masterUserId: z.string().min(1),
  projectKey: z.string().min(1),
  workItemTypeKey: z.string().min(1),
  workItemId: z.string().min(1),
  actionRunId,
});

export const bulkSyncMeegleWorkitemsSchema = z.object({
  masterUserId: z.string().min(1),
  projectKey: z.string().min(1),
  workItemTypeKeys: z.array(z.string().min(1)).min(1).optional(),
  actionRunId,
});

export const syncGitHubPullRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pullNumber: z.number().int().positive(),
  actionRunId,
});

export const bulkSyncGitHubPullRequestsSchema = z.object({
  repositories: z.array(z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
  })).min(1),
  actionRunId,
});

export const syncLarkBaseTicketSchema = z.object({
  masterUserId: z.string().min(1),
  larkBaseUrl: z.string().url().optional(),
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  recordId: z.string().min(1),
  ...larkTicketFields.shape,
  actionRunId,
});

export const bulkSyncLarkBaseTicketsSchema = z.object({
  masterUserId: z.string().min(1),
  larkBaseUrl: z.string().url().optional(),
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  ...larkTicketFields.shape,
  actionRunId,
});

export type SyncMeegleWorkitemRequest = z.infer<typeof syncMeegleWorkitemSchema>;
export type BulkSyncMeegleWorkitemsRequest = z.infer<typeof bulkSyncMeegleWorkitemsSchema>;
export type SyncGitHubPullRequestRequest = z.infer<typeof syncGitHubPullRequestSchema>;
export type BulkSyncGitHubPullRequestsRequest = z.infer<typeof bulkSyncGitHubPullRequestsSchema>;
export type SyncLarkBaseTicketRequest = z.infer<typeof syncLarkBaseTicketSchema>;
export type BulkSyncLarkBaseTicketsRequest = z.infer<typeof bulkSyncLarkBaseTicketsSchema>;
