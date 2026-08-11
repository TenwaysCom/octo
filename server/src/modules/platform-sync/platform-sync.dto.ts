import { z } from "zod";

const actionRunId = z.string().min(1).optional();
const cleanAfterSync = z.boolean().optional();
const larkTicketFields = z.object({
  titleFieldName: z.string().min(1).optional(),
  statusFieldName: z.string().min(1).optional(),
});

export const syncMeegleWorkitemSchema = z.object({
  masterUserId: z.string().min(1),
  projectKey: z.string().min(1),
  workItemTypeKey: z.string().min(1),
  workItemId: z.string().min(1),
  cleanAfterSync,
  actionRunId,
});

export const bulkSyncMeegleWorkitemsSchema = z.object({
  masterUserId: z.string().min(1),
  projectKey: z.string().min(1),
  workItemTypeKeys: z.array(z.string().min(1)).min(1).optional(),
  // Incremental CLI only: MQL field keys, keyed by work item type.
  // The fetched detail remains the canonical source timestamp.
  sourceUpdatedAtMqlFieldNames: z.record(z.string().min(1), z.string().min(1)).optional(),
  cleanAfterSync,
  actionRunId,
});

export const selectedSyncMeegleWorkitemsSchema = z.object({
  masterUserId: z.string().min(1),
  projectKey: z.string().min(1),
  workitems: z.array(z.object({
    workItemTypeKey: z.string().min(1),
    workItemId: z.string().min(1),
  })).min(1),
  cleanAfterSync,
  actionRunId,
});

export const syncGitHubPullRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pullNumber: z.number().int().positive(),
  cleanAfterSync,
  actionRunId,
});

export const bulkSyncGitHubPullRequestsSchema = z.object({
  repositories: z.array(z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
  })).min(1),
  cleanAfterSync,
  actionRunId,
});

export const selectedSyncGitHubPullRequestsSchema = z.object({
  pullRequests: z.array(z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    pullNumber: z.number().int().positive(),
  })).min(1),
  cleanAfterSync,
  actionRunId,
});

export const syncLarkBaseTicketSchema = z.object({
  masterUserId: z.string().min(1),
  larkBaseUrl: z.string().url().optional(),
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  recordId: z.string().min(1),
  ...larkTicketFields.shape,
  cleanAfterSync,
  actionRunId,
});

export const bulkSyncLarkBaseTicketsSchema = z.object({
  masterUserId: z.string().min(1),
  larkBaseUrl: z.string().url().optional(),
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  ...larkTicketFields.shape,
  // Incremental CLI only: the Bitable "last modified time" field used by the
  // source-side filter. It must observe updates to every synced source field.
  sourceUpdatedAtFieldName: z.string().min(1).optional(),
  cleanAfterSync,
  actionRunId,
});

export const selectedSyncLarkBaseTicketsSchema = z.object({
  masterUserId: z.string().min(1),
  larkBaseUrl: z.string().url().optional(),
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  ...larkTicketFields.shape,
  cleanAfterSync,
  actionRunId,
});

export type SyncMeegleWorkitemRequest = z.infer<typeof syncMeegleWorkitemSchema>;
export type BulkSyncMeegleWorkitemsRequest = z.infer<typeof bulkSyncMeegleWorkitemsSchema>;
export type SelectedSyncMeegleWorkitemsRequest = z.infer<typeof selectedSyncMeegleWorkitemsSchema>;
export type SyncGitHubPullRequestRequest = z.infer<typeof syncGitHubPullRequestSchema>;
export type BulkSyncGitHubPullRequestsRequest = z.infer<typeof bulkSyncGitHubPullRequestsSchema>;
export type SelectedSyncGitHubPullRequestsRequest = z.infer<typeof selectedSyncGitHubPullRequestsSchema>;
export type SyncLarkBaseTicketRequest = z.infer<typeof syncLarkBaseTicketSchema>;
export type BulkSyncLarkBaseTicketsRequest = z.infer<typeof bulkSyncLarkBaseTicketsSchema>;
export type SelectedSyncLarkBaseTicketsRequest = z.infer<typeof selectedSyncLarkBaseTicketsSchema>;
