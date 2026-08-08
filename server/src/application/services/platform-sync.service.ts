import { GitHubClient } from "../../adapters/github/github-client.js";
import type { GitHubPrDetails } from "../../adapters/github/github-types.js";
import type { LarkBitableRecord, LarkClient } from "../../adapters/lark/lark-client.js";
import type { MeegleClient, MeegleSyncMapping, MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import { getResolvedUserStore, type ResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { createMeegleClient } from "./meegle-client.factory.js";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";
import { logger } from "../../logger.js";
import type {
  BulkSyncGitHubPullRequestsRequest,
  BulkSyncLarkBaseTicketsRequest,
  BulkSyncMeegleWorkitemsRequest,
  SyncGitHubPullRequestRequest,
  SyncLarkBaseTicketRequest,
  SyncMeegleWorkitemRequest,
} from "../../modules/platform-sync/platform-sync.dto.js";

const syncLogger = logger.child({ module: "platform-sync-service" });
const INACTIVE_STATUSES = new Set([
  "terminated", "cancelled", "finish", "finished", "rejected", "merged", "closed",
  "end",
  "已终止", "已取消", "已完成", "已合并", "已关闭",
]);
const STATUS_FIELD_CANDIDATES = ["Status", "状态", "Ticket Status", "ticket_status"];
const TITLE_FIELD_CANDIDATES = ["Title", "标题", "名称", "name"];

type MeegleSyncClient = Pick<MeegleClient, "getWorkitemDetails" | "filterWorkitems"> & {
  getSyncMappings?: (projectKey: string, workitemTypeKeys: string[]) => Promise<MeegleSyncMapping[]>;
};

export interface PlatformSyncServiceDeps {
  store?: PlatformSyncStore;
  resolvedUserStore?: ResolvedUserStore;
  createMeegleClient?: (input: { masterUserId: string; projectKey: string }) => Promise<MeegleSyncClient>;
  createLarkClient?: (input: { masterUserId: string; larkBaseUrl?: string }) => Promise<LarkClient>;
  createGitHubClient?: () => GitHubClient;
}

export function isInactiveSyncStatus(status: string | undefined): boolean {
  return INACTIVE_STATUSES.has(status?.trim().toLowerCase() ?? "");
}

export class PlatformSyncService {
  private store?: PlatformSyncStore;
  private readonly resolvedUserStore: ResolvedUserStore;

  constructor(private readonly deps: PlatformSyncServiceDeps = {}) {
    this.store = deps.store;
    this.resolvedUserStore = deps.resolvedUserStore ?? getResolvedUserStore();
  }

  async syncMeegleWorkitem(request: SyncMeegleWorkitemRequest) {
    const client = await this.getMeegleClient(request.masterUserId, request.projectKey);
    const workitems = await client.getWorkitemDetails(
      request.projectKey,
      request.workItemTypeKey,
      [request.workItemId],
    );
    const workitem = workitems[0];
    if (!workitem) {
      throw new Error(`Meegle workitem ${request.workItemId} was not found`);
    }
    const metadataMappings = client.getSyncMappings
      ? await client.getSyncMappings(request.projectKey, [request.workItemTypeKey])
      : [];
    const mappings = mergeMeegleMappings([
      ...metadataMappings,
      ...getWorkitemMappings(request.projectKey, workitem),
    ]);
    await this.syncStore.upsertMeegleMappings(mappings);
    const mappingIndex = new Map(mappings.map((mapping) => [mappingKey(mapping), mapping.displayValue]));
    await this.syncStore.upsertMeegleWorkitem({
      projectKey: request.projectKey,
      workItemTypeKey: request.workItemTypeKey,
      workitem: applyMeegleMappings(workitem, mappingIndex),
    });
    return { synced: 1, workItemId: workitem.id, status: workitem.status };
  }

  async bulkSyncMeegleWorkitems(request: BulkSyncMeegleWorkitemsRequest) {
    const client = await this.getMeegleClient(request.masterUserId, request.projectKey);
    const configuredTypes = request.workItemTypeKeys ?? [];
    const metadataMappings = client.getSyncMappings
      ? await client.getSyncMappings(request.projectKey, configuredTypes)
      : [];
    await this.syncStore.upsertMeegleMappings(metadataMappings);
    const listed = await client.filterWorkitems(request.projectKey, {
      workitemTypeKeys: request.workItemTypeKeys,
      pageSize: 100,
      autoPaginate: true,
    });
    const active = listed.filter((item) => !isInactiveSyncStatus(item.status));
    const detailed = await this.getDetailedMeegleWorkitems(client, request.projectKey, active);
    const mappings = mergeMeegleMappings([
      ...metadataMappings,
      ...detailed.flatMap((workitem) => getWorkitemMappings(request.projectKey, workitem)),
    ]);
    await this.syncStore.upsertMeegleMappings(mappings);
    const mappingIndex = new Map(mappings.map((mapping) => [mappingKey(mapping), mapping.displayValue]));
    let synced = 0;

    for (const workitem of detailed) {
      await this.syncStore.upsertMeegleWorkitem({
        projectKey: request.projectKey,
        workItemTypeKey: workitem.type,
        workitem: applyMeegleMappings(workitem, mappingIndex),
      });
      synced++;
    }

    syncLogger.info({ projectKey: request.projectKey, listed: listed.length, synced }, "MEEGLE_BULK_SYNC_COMPLETED");
    return { listed: listed.length, skippedInactive: listed.length - active.length, synced };
  }

  async syncGitHubPullRequest(request: SyncGitHubPullRequestRequest) {
    const client = this.getGitHubClient();
    const pullRequest = await client.getPullRequest(request.owner, request.repo, request.pullNumber);
    await this.syncStore.upsertGitHubPullRequest({
      owner: request.owner,
      repo: request.repo,
      pullRequest,
    });
    return { synced: 1, pullNumber: pullRequest.number, state: pullRequest.state };
  }

  async bulkSyncGitHubPullRequests(request: BulkSyncGitHubPullRequestsRequest) {
    const client = this.getGitHubClient();
    let listed = 0;
    let synced = 0;

    for (const repository of request.repositories) {
      const pullRequests = await client.listOpenPullRequests(repository.owner, repository.repo);
      listed += pullRequests.length;
      for (const listedPullRequest of pullRequests) {
        if (isInactiveSyncStatus(listedPullRequest.state) || listedPullRequest.merged_at) {
          continue;
        }
        const pullRequest = await client.getPullRequest(
          repository.owner,
          repository.repo,
          listedPullRequest.number,
        );
        if (isInactiveSyncStatus(pullRequest.state) || pullRequest.merged_at) {
          continue;
        }
        await this.syncStore.upsertGitHubPullRequest({
          owner: repository.owner,
          repo: repository.repo,
          pullRequest,
        });
        synced++;
      }
    }

    syncLogger.info({ repositories: request.repositories.length, listed, synced }, "GITHUB_BULK_SYNC_COMPLETED");
    return { listed, skippedInactive: listed - synced, synced };
  }

  async syncLarkBaseTicket(request: SyncLarkBaseTicketRequest) {
    const client = await this.getLarkClient(request.masterUserId, request.larkBaseUrl);
    const record = await client.getRecord(request.baseId, request.tableId, request.recordId);
    await this.upsertLarkBaseTicket(request, record);
    return {
      synced: 1,
      recordId: record.record_id,
      status: getRecordFieldText(record, request.statusFieldName, STATUS_FIELD_CANDIDATES),
    };
  }

  async bulkSyncLarkBaseTickets(request: BulkSyncLarkBaseTicketsRequest) {
    const client = await this.getLarkClient(request.masterUserId, request.larkBaseUrl);
    let pageToken: string | undefined;
    let listed = 0;
    let skippedInactive = 0;
    let synced = 0;

    do {
      const page = await client.listRecords(request.baseId, request.tableId, {
        pageSize: 100,
        pageToken,
      });
      listed += page.records.length;
      for (const record of page.records) {
        const status = getRecordFieldText(record, request.statusFieldName, STATUS_FIELD_CANDIDATES);
        if (isInactiveSyncStatus(status)) {
          skippedInactive++;
          continue;
        }
        await this.upsertLarkBaseTicket(request, record);
        synced++;
      }
      pageToken = page.hasMore ? page.nextPageToken : undefined;
    } while (pageToken);

    syncLogger.info({ baseId: request.baseId, tableId: request.tableId, listed, synced }, "LARK_BASE_BULK_SYNC_COMPLETED");
    return { listed, skippedInactive, synced };
  }

  private async getMeegleClient(masterUserId: string, projectKey: string): Promise<MeegleSyncClient> {
    if (this.deps.createMeegleClient) {
      return this.deps.createMeegleClient({ masterUserId, projectKey });
    }
    const user = await this.resolvedUserStore.getById(masterUserId);
    if (!user) {
      throw new Error("IDENTITY_NOT_FOUND");
    }
    if (!user.meegleUserKey || !user.meegleBaseUrl) {
      throw new Error("MEEGLE_BINDING_REQUIRED");
    }
    return createMeegleClient({
      masterUserId,
      meegleUserKey: user.meegleUserKey,
      baseUrl: user.meegleBaseUrl,
    });
  }

  private async getDetailedMeegleWorkitems(
    client: MeegleSyncClient,
    projectKey: string,
    workitems: MeegleWorkitem[],
  ): Promise<MeegleWorkitem[]> {
    const byId = new Map(workitems.map((workitem) => [workitem.id, workitem]));
    const byType = new Map<string, string[]>();
    for (const workitem of workitems) {
      const ids = byType.get(workitem.type) ?? [];
      ids.push(workitem.id);
      byType.set(workitem.type, ids);
    }
    for (const [workItemTypeKey, workitemIds] of byType) {
      for (const workitemIdChunk of chunk(workitemIds, 50)) {
        const detailed = await client.getWorkitemDetails(projectKey, workItemTypeKey, workitemIdChunk);
        for (const workitem of detailed) {
          byId.set(workitem.id, workitem);
        }
      }
    }
    return workitems.map((workitem) => byId.get(workitem.id) ?? workitem);
  }

  private get syncStore(): PlatformSyncStore {
    this.store ??= new PostgresPlatformSyncStore();
    return this.store;
  }

  private async getLarkClient(masterUserId: string, larkBaseUrl?: string): Promise<LarkClient> {
    if (this.deps.createLarkClient) {
      return this.deps.createLarkClient({ masterUserId, larkBaseUrl });
    }
    const { client } = await buildAuthenticatedLarkClient(
      masterUserId,
      larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.feishu.cn",
    );
    return client;
  }

  private getGitHubClient(): GitHubClient {
    if (this.deps.createGitHubClient) {
      return this.deps.createGitHubClient();
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN_NOT_CONFIGURED");
    }
    return new GitHubClient({ token });
  }

  private async upsertLarkBaseTicket(
    request: Pick<SyncLarkBaseTicketRequest, "baseId" | "tableId" | "titleFieldName" | "statusFieldName">,
    record: LarkBitableRecord,
  ): Promise<void> {
    await this.syncStore.upsertLarkBaseTicket({
      baseId: request.baseId,
      tableId: request.tableId,
      record,
      title: getRecordFieldText(record, request.titleFieldName, TITLE_FIELD_CANDIDATES) || record.record_id,
      status: getRecordFieldText(record, request.statusFieldName, STATUS_FIELD_CANDIDATES) || undefined,
    });
  }
}

function getWorkitemMappings(projectKey: string, workitem: MeegleWorkitem): MeegleSyncMapping[] {
  const mappings: MeegleSyncMapping[] = [];
  if (workitem.type && workitem.workItemType) {
    mappings.push({
      projectKey,
      workItemTypeKey: workitem.type,
      kind: "workitem_type",
      sourceKey: workitem.type,
      displayValue: workitem.workItemType,
    });
  }
  if (workitem.type && workitem.statusKey && workitem.status) {
    mappings.push({
      projectKey,
      workItemTypeKey: workitem.type,
      kind: "status",
      sourceKey: workitem.statusKey,
      displayValue: workitem.status,
    });
  }
  if (workitem.type && workitem.subStageKey && workitem.subStage) {
    mappings.push({
      projectKey,
      workItemTypeKey: workitem.type,
      kind: "sub_stage",
      sourceKey: workitem.subStageKey,
      displayValue: workitem.subStage,
    });
  }
  return mappings;
}

function applyMeegleMappings(workitem: MeegleWorkitem, mappings: Map<string, string>): MeegleWorkitem {
  return {
    ...workitem,
    workItemType: mappings.get(mappingKey({
      workItemTypeKey: workitem.type,
      kind: "workitem_type",
      sourceKey: workitem.type,
    })) ?? workitem.workItemType,
    status: workitem.statusKey
      ? mappings.get(mappingKey({
        workItemTypeKey: workitem.type,
        kind: "status",
        sourceKey: workitem.statusKey,
      })) ?? workitem.status
      : workitem.status,
    subStage: workitem.subStageKey
      ? mappings.get(mappingKey({
        workItemTypeKey: workitem.type,
        kind: "sub_stage",
        sourceKey: workitem.subStageKey,
      })) ?? workitem.subStage
      : workitem.subStage,
  };
}

function mergeMeegleMappings(mappings: MeegleSyncMapping[]): MeegleSyncMapping[] {
  return [...new Map(mappings.map((mapping) => [mappingKey(mapping), mapping])).values()];
}

function mappingKey(mapping: Pick<MeegleSyncMapping, "workItemTypeKey" | "kind" | "sourceKey">): string {
  return `${mapping.workItemTypeKey}\u0000${mapping.kind}\u0000${mapping.sourceKey}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function getRecordFieldText(
  record: LarkBitableRecord,
  configuredFieldName: string | undefined,
  candidates: string[],
): string {
  const fields = record.fields;
  const fieldName = [configuredFieldName, ...candidates]
    .find((name): name is string => Boolean(name && Object.prototype.hasOwnProperty.call(fields, name)));
  return fieldName ? valueToText(fields[fieldName]) : "";
}

function valueToText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join(", ");
  }
  if (value && typeof value === "object") {
    const entry = value as Record<string, unknown>;
    for (const key of ["text", "name", "label", "value"]) {
      if (entry[key] !== undefined) {
        return valueToText(entry[key]);
      }
    }
  }
  return "";
}
