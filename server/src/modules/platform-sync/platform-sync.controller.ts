import { ZodError } from "zod";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";
import { PlatformSyncService } from "../../application/services/platform-sync.service.js";
import {
  bulkSyncGitHubPullRequestsSchema,
  bulkSyncLarkBaseTicketsSchema,
  bulkSyncMeegleWorkitemsSchema,
  selectedSyncGitHubPullRequestsSchema,
  selectedSyncLarkBaseTicketsSchema,
  selectedSyncMeegleWorkitemsSchema,
  syncGitHubPullRequestSchema,
  syncLarkBaseTicketSchema,
  syncMeegleWorkitemSchema,
} from "./platform-sync.dto.js";

const MODULE = "platform-sync";
const service = new PlatformSyncService();

function execute(input: unknown, operation: () => Promise<unknown>) {
  return operation().then((data) => ({ ok: true as const, data })).catch((error) => ({
    ok: false as const,
    error: createActionErrorEnvelopeFromError(error, {
      module: MODULE,
      stage: error instanceof ZodError ? "server.action.received" : "server.workflow.failed",
      errorCode: error instanceof ZodError ? "INVALID_REQUEST" : "SYNC_FAILED",
      actionRunId: getActionRunId(input),
    }),
  }));
}

export function syncMeegleWorkitemController(input: unknown) {
  return execute(input, () => service.syncMeegleWorkitem(syncMeegleWorkitemSchema.parse(input)));
}

export function bulkSyncMeegleWorkitemsController(input: unknown) {
  return execute(input, () => service.bulkSyncMeegleWorkitems(bulkSyncMeegleWorkitemsSchema.parse(input)));
}

export function selectedSyncMeegleWorkitemsController(input: unknown) {
  return execute(input, () => service.selectedSyncMeegleWorkitems(selectedSyncMeegleWorkitemsSchema.parse(input)));
}

export function syncGitHubPullRequestController(input: unknown) {
  return execute(input, () => service.syncGitHubPullRequest(syncGitHubPullRequestSchema.parse(input)));
}

export function bulkSyncGitHubPullRequestsController(input: unknown) {
  return execute(input, () => service.bulkSyncGitHubPullRequests(bulkSyncGitHubPullRequestsSchema.parse(input)));
}

export function selectedSyncGitHubPullRequestsController(input: unknown) {
  return execute(input, () => service.selectedSyncGitHubPullRequests(selectedSyncGitHubPullRequestsSchema.parse(input)));
}

export function syncLarkBaseTicketController(input: unknown) {
  return execute(input, () => service.syncLarkBaseTicket(syncLarkBaseTicketSchema.parse(input)));
}

export function bulkSyncLarkBaseTicketsController(input: unknown) {
  return execute(input, () => service.bulkSyncLarkBaseTickets(bulkSyncLarkBaseTicketsSchema.parse(input)));
}

export function selectedSyncLarkBaseTicketsController(input: unknown) {
  return execute(input, () => service.selectedSyncLarkBaseTickets(selectedSyncLarkBaseTicketsSchema.parse(input)));
}
