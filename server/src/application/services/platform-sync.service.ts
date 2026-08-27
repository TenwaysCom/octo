import { GitHubClient } from "../../adapters/github/github-client.js";
import type { GitHubPrDetails } from "../../adapters/github/github-types.js";
import type { LarkBitableRecord, LarkClient } from "../../adapters/lark/lark-client.js";
import type { MeegleClient, MeegleSyncMapping, MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
  type GitHubPullRequestSyncRef,
  type LarkBaseTicketSyncRef,
  type LarkBaseTicketUpsertInput,
  type MeegleWorkitemSyncRef,
} from "../../adapters/postgres/platform-sync-store.js";
import { getResolvedUserStore, type ResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { createMeegleClient } from "./meegle-client.factory.js";
import { extractMeegleCleaningRelations, getMeegleCleaningFieldKeys } from "./meegle-cleaning.config.js";
import { buildGitHubPrCleaningProjection } from "./github-pr-cleaning.js";
import { buildLarkTicketCleaningProjection } from "./lark-ticket-cleaning.js";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";
import { logger } from "../../logger.js";
import { isMeegleProductionBugType, isMeegleSprintType } from "../../domain/meegle-workitem-types.js";
import { getMeegleSprintDetailFieldKeys } from "./meegle-sprint-snapshot.js";
import type {
  BulkSyncGitHubPullRequestsRequest,
  BulkSyncLarkBaseTicketsRequest,
  BulkSyncMeegleWorkitemsRequest,
  SelectedSyncGitHubPullRequestsRequest,
  SelectedSyncLarkBaseTicketsRequest,
  SelectedSyncMeegleWorkitemsRequest,
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
const TITLE_FIELD_CANDIDATES = ["Title", "标题", "名称", "name", "Issue Description", "问题描述", "问题"];
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;
const LARK_BATCH_GET_SIZE = 100;

type MeegleSyncClient = Omit<Pick<MeegleClient, "getWorkitemDetails" | "filterWorkitems">, "getWorkitemDetails"> & {
  getWorkitemDetails: (
    projectKey: string,
    workItemTypeKey: string,
    workItemIds: string[],
    fieldKeys?: string[],
  ) => Promise<MeegleWorkitem[]>;
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
    return this.withOptionalMeegleCleaning(
      request.cleanAfterSync,
      [{ projectKey: request.projectKey, workItemTypeKey: request.workItemTypeKey, workItemId: workitem.id }],
      { synced: 1, workItemId: workitem.id, status: workitem.status },
    );
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
    const active = listed.filter((item) => isMeegleSprintType(item.type) || !isInactiveSyncStatus(item.status));
    const detailed = await this.getDetailedMeegleWorkitems(client, request.projectKey, active);
    const mappings = mergeMeegleMappings([
      ...metadataMappings,
      ...detailed.flatMap((workitem) => getWorkitemMappings(request.projectKey, workitem)),
    ]);
    await this.syncStore.upsertMeegleMappings(mappings);
    const mappingIndex = new Map(mappings.map((mapping) => [mappingKey(mapping), mapping.displayValue]));
    let synced = 0;
    const syncedRefs: MeegleWorkitemSyncRef[] = [];

    for (const workitem of detailed) {
      await this.syncStore.upsertMeegleWorkitem({
        projectKey: request.projectKey,
        workItemTypeKey: workitem.type,
        workitem: applyMeegleMappings(workitem, mappingIndex),
      });
      synced++;
      syncedRefs.push({
        projectKey: request.projectKey,
        workItemTypeKey: workitem.type,
        workItemId: workitem.id,
      });
    }

    syncLogger.info({ projectKey: request.projectKey, listed: listed.length, synced }, "MEEGLE_BULK_SYNC_COMPLETED");
    return this.withOptionalMeegleCleaning(
      request.cleanAfterSync,
      syncedRefs,
      { listed: listed.length, skippedInactive: listed.length - active.length, synced },
    );
  }

  async incrementalSyncMeegleWorkitems(input: BulkSyncMeegleWorkitemsRequest & { watermarkUpdatedAt: string; watermarkTiebreaker: string }) {
    const client = await this.getMeegleClient(input.masterUserId, input.projectKey);
    const threshold = new Date(new Date(input.watermarkUpdatedAt).getTime() - INCREMENTAL_OVERLAP_MS).getTime();
    if (Number.isNaN(threshold)) throw new Error(`Invalid Meegle checkpoint watermark: ${input.watermarkUpdatedAt}`);
    const sourceUpdatedAfter = new Date(threshold).toISOString();
    const listed = await client.filterWorkitems(input.projectKey, {
      workitemTypeKeys: input.workItemTypeKeys,
      pageSize: 50,
      autoPaginate: true,
      sourceUpdatedAfter,
      sourceUpdatedAtMqlFieldNames: input.sourceUpdatedAtMqlFieldNames,
    });
    if (listed.some((item) => !isValidSourceTimestamp(item.updatedAt))) {
      throw new Error("Meegle incremental MQL result is missing source_updated_at");
    }
    const detailed = await this.getDetailedMeegleWorkitems(client, input.projectKey, listed);
    if (detailed.some((item) => !isValidSourceTimestamp(item.updatedAt))) {
      throw new Error("Meegle incremental batch detail is missing source_updated_at");
    }
    const changed = detailed.filter((item) => new Date(item.updatedAt!).getTime() >= threshold);
    const configuredTypes = input.workItemTypeKeys ?? [];
    const metadataMappings = client.getSyncMappings
      ? await client.getSyncMappings(input.projectKey, configuredTypes)
      : [];
    await this.syncStore.upsertMeegleMappings(metadataMappings);
    const mappings = mergeMeegleMappings([
      ...metadataMappings,
      ...changed.flatMap((workitem) => getWorkitemMappings(input.projectKey, workitem)),
    ]);
    await this.syncStore.upsertMeegleMappings(mappings);
    const mappingIndex = new Map(mappings.map((mapping) => [mappingKey(mapping), mapping.displayValue]));
    const syncedRefs: MeegleWorkitemSyncRef[] = [];
    for (const item of changed) {
      await this.syncStore.upsertMeegleWorkitem({
        projectKey: input.projectKey,
        workItemTypeKey: item.type,
        workitem: applyMeegleMappings(item, mappingIndex),
      });
      syncedRefs.push({ projectKey: input.projectKey, workItemTypeKey: item.type, workItemId: item.id });
    }
    const latest = latestWatermark(changed.map((item) => ({ updatedAt: item.updatedAt, tiebreaker: `${item.type}:${item.id}` })), input);
    return this.withOptionalMeegleCleaning(input.cleanAfterSync, syncedRefs, {
      listed: listed.length,
      skippedInactive: 0,
      synced: changed.length,
      watermarkUpdatedAt: latest.updatedAt,
      watermarkTiebreaker: latest.tiebreaker,
    });
  }

  async selectedSyncMeegleWorkitems(request: SelectedSyncMeegleWorkitemsRequest) {
    for (const workitem of request.workitems) {
      await this.syncMeegleWorkitem({
        masterUserId: request.masterUserId,
        projectKey: request.projectKey,
        workItemTypeKey: workitem.workItemTypeKey,
        workItemId: workitem.workItemId,
        actionRunId: request.actionRunId,
      });
    }
    const refs = request.workitems.map((workitem) => ({
      projectKey: request.projectKey,
      workItemTypeKey: workitem.workItemTypeKey,
      workItemId: workitem.workItemId,
    }));
    return this.withOptionalMeegleCleaning(
      request.cleanAfterSync,
      refs,
      { selected: request.workitems.length, synced: request.workitems.length },
    );
  }

  async syncGitHubPullRequest(request: SyncGitHubPullRequestRequest) {
    const client = this.getGitHubClient();
    const pullRequest = await client.getPullRequest(request.owner, request.repo, request.pullNumber);
    await this.syncStore.upsertGitHubPullRequest({
      owner: request.owner,
      repo: request.repo,
      pullRequest,
    });
    return this.withOptionalGitHubCleaning(
      request.cleanAfterSync,
      [{ owner: request.owner, repo: request.repo, pullNumber: pullRequest.number }],
      { synced: 1, pullNumber: pullRequest.number, state: pullRequest.state },
    );
  }

  async bulkSyncGitHubPullRequests(request: BulkSyncGitHubPullRequestsRequest) {
    const client = this.getGitHubClient();
    let listed = 0;
    let synced = 0;
    const syncedRefs: GitHubPullRequestSyncRef[] = [];

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
        syncedRefs.push({
          owner: repository.owner,
          repo: repository.repo,
          pullNumber: pullRequest.number,
        });
      }
    }

    syncLogger.info({ repositories: request.repositories.length, listed, synced }, "GITHUB_BULK_SYNC_COMPLETED");
    return this.withOptionalGitHubCleaning(
      request.cleanAfterSync,
      syncedRefs,
      { listed, skippedInactive: listed - synced, synced },
    );
  }

  async incrementalSyncGitHubPullRequests(input: {
    owner: string;
    repo: string;
    watermarkUpdatedAt: string;
    watermarkTiebreaker: string;
    cleanAfterSync?: boolean;
    actionRunId?: string;
  }) {
    const threshold = new Date(new Date(input.watermarkUpdatedAt).getTime() - INCREMENTAL_OVERLAP_MS).getTime();
    if (Number.isNaN(threshold)) throw new Error(`Invalid GitHub checkpoint watermark: ${input.watermarkUpdatedAt}`);
    const client = this.getGitHubClient();
    const listed = await client.listPullRequestsUpdatedSince(input.owner, input.repo, new Date(threshold).toISOString());
    if (listed.some((pullRequest) => !isValidSourceTimestamp(pullRequest.updated_at))) {
      throw new Error("GitHub incremental result is missing updated_at");
    }
    const detailed = await Promise.all(listed.map((pullRequest) => (
      client.getPullRequest(input.owner, input.repo, pullRequest.number)
    )));
    if (detailed.some((pullRequest) => !isValidSourceTimestamp(pullRequest.updated_at))) {
      throw new Error("GitHub incremental detail is missing updated_at");
    }
    const changed = detailed.filter((pullRequest) => new Date(pullRequest.updated_at).getTime() >= threshold);
    const syncedRefs: GitHubPullRequestSyncRef[] = [];
    for (const pullRequest of changed) {
      await this.syncStore.upsertGitHubPullRequest({
        owner: input.owner,
        repo: input.repo,
        pullRequest,
      });
      syncedRefs.push({ owner: input.owner, repo: input.repo, pullNumber: pullRequest.number });
    }
    const latest = latestWatermark(changed.map((pullRequest) => ({
      updatedAt: pullRequest.updated_at,
      tiebreaker: String(pullRequest.number).padStart(12, "0"),
    })), input);
    return this.withOptionalGitHubCleaning(input.cleanAfterSync, syncedRefs, {
      listed: listed.length,
      skippedInactive: 0,
      synced: changed.length,
      watermarkUpdatedAt: latest.updatedAt,
      watermarkTiebreaker: latest.tiebreaker,
    });
  }

  async selectedSyncGitHubPullRequests(request: SelectedSyncGitHubPullRequestsRequest) {
    for (const pullRequest of request.pullRequests) {
      await this.syncGitHubPullRequest({ ...pullRequest, actionRunId: request.actionRunId });
    }
    return this.withOptionalGitHubCleaning(
      request.cleanAfterSync,
      request.pullRequests,
      { selected: request.pullRequests.length, synced: request.pullRequests.length },
    );
  }

  async syncLarkBaseTicket(request: SyncLarkBaseTicketRequest) {
    const client = await this.getLarkClient(request.masterUserId, request.larkBaseUrl);
    const [record] = await this.getLarkRecordsInBatches(
      client,
      request.baseId,
      request.tableId,
      [request.recordId],
    );
    await this.upsertLarkBaseTickets(request, [record]);
    return this.withOptionalLarkCleaning(request.cleanAfterSync, [{
      baseId: request.baseId,
      tableId: request.tableId,
      recordId: record.record_id,
    }], {
      synced: 1,
      recordId: record.record_id,
      status: getRecordFieldText(record, request.statusFieldName, STATUS_FIELD_CANDIDATES),
    });
  }

  async bulkSyncLarkBaseTickets(request: BulkSyncLarkBaseTicketsRequest) {
    const client = await this.getLarkClient(request.masterUserId, request.larkBaseUrl);
    let pageToken: string | undefined;
    const records: LarkBitableRecord[] = [];

    do {
      const page = await client.listRecords(request.baseId, request.tableId, {
        pageSize: 100,
        pageToken,
        automaticFields: true,
      });
      records.push(...page.records);
      pageToken = page.hasMore ? page.nextPageToken : undefined;
    } while (pageToken);

    const activeRecords = records.filter((record) => !isInactiveSyncStatus(
      getRecordFieldText(record, request.statusFieldName, STATUS_FIELD_CANDIDATES),
    ));
    await this.upsertLarkBaseTickets(request, activeRecords);
    const syncedRefs = activeRecords.map((record) => ({
      baseId: request.baseId,
      tableId: request.tableId,
      recordId: record.record_id,
    }));
    const listed = records.length;
    const synced = activeRecords.length;
    const skippedInactive = records.length - activeRecords.length;
    syncLogger.info({ baseId: request.baseId, tableId: request.tableId, listed, synced }, "LARK_BASE_BULK_SYNC_COMPLETED");
    const result = await this.withOptionalLarkCleaning(
      request.cleanAfterSync,
      syncedRefs,
      { listed, skippedInactive, synced },
    );
    return result;
  }

  async incrementalSyncLarkBaseTickets(input: BulkSyncLarkBaseTicketsRequest & { watermarkUpdatedAt: string; watermarkTiebreaker: string }) {
    const client = await this.getLarkClient(input.masterUserId, input.larkBaseUrl);
    const records: LarkBitableRecord[] = [];
    const threshold = new Date(new Date(input.watermarkUpdatedAt).getTime() - INCREMENTAL_OVERLAP_MS).getTime();
    if (Number.isNaN(threshold)) throw new Error(`Invalid Lark checkpoint watermark: ${input.watermarkUpdatedAt}`);
    if (!input.sourceUpdatedAtFieldName) {
      throw new Error("Lark incremental sync requires sourceUpdatedAtFieldName (a Bitable last-modified-time field)");
    }
    const filter = buildLarkUpdatedSinceFilter(input.sourceUpdatedAtFieldName, threshold);
    let pageToken: string | undefined;
    do {
      const page = await client.listRecords(input.baseId, input.tableId, {
        pageSize: 100,
        pageToken,
        filter,
        automaticFields: true,
      });
      records.push(...page.records);
      pageToken = page.hasMore ? page.nextPageToken : undefined;
    } while (pageToken);
    if (records.some((record) => !isValidSourceTimestamp(record.updated_time))) {
      throw new Error("Lark incremental list record is missing updated_time");
    }
    const changed = records.filter((record) => new Date(record.updated_time!).getTime() >= threshold);
    await this.upsertLarkBaseTickets(input, changed);
    const syncedRefs = changed.map((record) => ({
      baseId: input.baseId,
      tableId: input.tableId,
      recordId: record.record_id,
    }));
    const latest = latestWatermark(records.map((record) => ({ updatedAt: record.updated_time, tiebreaker: record.record_id })), input);
    const result = await this.withOptionalLarkCleaning(input.cleanAfterSync, syncedRefs, {
      listed: records.length,
      skippedInactive: 0,
      synced: changed.length,
      watermarkUpdatedAt: latest.updatedAt,
      watermarkTiebreaker: latest.tiebreaker,
    });
    return result;
  }

  async selectedSyncLarkBaseTickets(request: SelectedSyncLarkBaseTicketsRequest) {
    const client = await this.getLarkClient(request.masterUserId, request.larkBaseUrl);
    const records = await this.getLarkRecordsInBatches(
      client,
      request.baseId,
      request.tableId,
      request.recordIds,
    );
    await this.upsertLarkBaseTickets(request, records);
    const refs = records.map((record) => ({
      baseId: request.baseId,
      tableId: request.tableId,
      recordId: record.record_id,
    }));
    return this.withOptionalLarkCleaning(
      request.cleanAfterSync,
      refs,
      { selected: request.recordIds.length, synced: request.recordIds.length },
    );
  }

  async cleanMeegleWorkitems(refs: MeegleWorkitemSyncRef[]): Promise<number> {
    const snapshots = await this.syncStore.getMeegleWorkitemsForCleaning(refs);
    return this.cleanSnapshots("meegle", snapshots, (snapshot) => (
      `${snapshot.projectKey}/${snapshot.workItemTypeKey}/${snapshot.workItemId}`
    ), async (snapshot) => {
      const relations = snapshot.sourcePayload ? extractMeegleCleaningRelations(snapshot.sourcePayload) : {};
      return this.syncStore.applyMeegleWorkitemCleaning({
        projectKey: snapshot.projectKey,
        workItemTypeKey: snapshot.workItemTypeKey,
        workItemId: snapshot.workItemId,
        sprint: typeof relations.sprint === "string" ? relations.sprint : snapshot.sprint,
        version: typeof relations.version === "string" ? relations.version : snapshot.version,
        system: typeof relations.system === "string" ? relations.system : snapshot.system,
        bugs: Array.isArray(relations.bugs) ? relations.bugs : snapshot.bugs ?? [],
      });
    });
  }

  async cleanGitHubPullRequests(refs: GitHubPullRequestSyncRef[]): Promise<number> {
    const snapshots = await this.syncStore.getGitHubPullRequestsForCleaning(refs);
    return this.cleanSnapshots("github", snapshots, (snapshot) => (
      `${snapshot.owner}/${snapshot.repo}#${snapshot.pullNumber}`
    ), async (snapshot) => {
      const pullRequest = buildGitHubPrCleaningProjection(snapshot.sourcePayload, snapshot.authorLogin);
      return this.syncStore.applyGitHubPullRequestCleaning({
        owner: snapshot.owner,
        repo: snapshot.repo,
        pullNumber: snapshot.pullNumber,
        author: pullRequest.author,
        mergedBy: pullRequest.mergedBy,
        reviewers: pullRequest.reviewers,
        labels: pullRequest.labels,
        createdAt: pullRequest.createdAt,
      });
    });
  }

  async cleanLarkBaseTickets(refs: LarkBaseTicketSyncRef[]): Promise<number> {
    const snapshots = await this.syncStore.getLarkBaseTicketsForCleaning(refs);
    const inputs = snapshots.map((snapshot) => {
      const ticket = buildLarkTicketCleaningProjection(snapshot.sourceFields, snapshot.createdTime);
      return {
        baseId: snapshot.baseId,
        tableId: snapshot.tableId,
        recordId: snapshot.recordId,
        ...ticket,
      };
    });
    try {
      return await this.syncStore.applyLarkBaseTicketCleanings(inputs);
    } catch (error) {
      syncLogger.warn({ platform: "lark", batchSize: inputs.length }, "PLATFORM_SYNC_CLEANING_BATCH_FAILED");
      throw new Error(`PLATFORM_SYNC_CLEANING_FAILED:lark:${inputs.length}`, { cause: error });
    }
  }

  private async cleanSnapshots<T>(
    platform: "meegle" | "github" | "lark",
    snapshots: T[],
    reference: (snapshot: T) => string,
    clean: (snapshot: T) => Promise<boolean>,
  ): Promise<number> {
    let cleaned = 0;
    const failures: string[] = [];
    for (const snapshot of snapshots) {
      const ref = reference(snapshot);
      try {
        if (await clean(snapshot)) cleaned++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${ref}: ${message}`);
        syncLogger.warn({ platform, ref, errorMessage: message }, "PLATFORM_SYNC_CLEANING_ITEM_FAILED");
      }
    }
    if (failures.length > 0) {
      throw new Error(`PLATFORM_SYNC_CLEANING_FAILED:${platform}:${failures.length}/${snapshots.length}:${failures.join("; ")}`);
    }
    return cleaned;
  }

  private async withOptionalMeegleCleaning<T extends object>(
    cleanAfterSync: boolean | undefined,
    refs: MeegleWorkitemSyncRef[],
    result: T,
  ): Promise<T | (T & { cleaned: number })> {
    return cleanAfterSync ? { ...result, cleaned: await this.cleanMeegleWorkitems(refs) } : result;
  }

  private async withOptionalGitHubCleaning<T extends object>(
    cleanAfterSync: boolean | undefined,
    refs: GitHubPullRequestSyncRef[],
    result: T,
  ): Promise<T | (T & { cleaned: number })> {
    return cleanAfterSync ? { ...result, cleaned: await this.cleanGitHubPullRequests(refs) } : result;
  }

  private async withOptionalLarkCleaning<T extends object>(
    cleanAfterSync: boolean | undefined,
    refs: LarkBaseTicketSyncRef[],
    result: T,
  ): Promise<T | (T & { cleaned: number })> {
    return cleanAfterSync ? { ...result, cleaned: await this.cleanLarkBaseTickets(refs) } : result;
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
        const detailed = await client.getWorkitemDetails(
          projectKey,
          workItemTypeKey,
          workitemIdChunk,
          [...new Set([
            ...getMeegleCleaningFieldKeys(workItemTypeKey),
            ...getMeegleSprintDetailFieldKeys(workItemTypeKey),
          ])],
        );
        for (const workitem of detailed) {
          byId.set(workitem.id, workitem);
        }
      }
    }
    return workitems.map((candidate) => {
      const detailed = byId.get(candidate.id) ?? candidate;
      if (detailed.updatedAt || isMeegleProductionBugType(detailed.type)) {
        return detailed;
      }
      // +batch-get omits updated_at for normal types; retain the MQL value that
      // selected this exact candidate. Production Bug must use detail update_time.
      return { ...detailed, updatedAt: candidate.updatedAt };
    });
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

  private async upsertLarkBaseTickets(
    request: Pick<SyncLarkBaseTicketRequest, "baseId" | "tableId" | "titleFieldName" | "statusFieldName">,
    records: LarkBitableRecord[],
  ): Promise<void> {
    const inputs: LarkBaseTicketUpsertInput[] = records.map((record) => ({
      baseId: request.baseId,
      tableId: request.tableId,
      record,
      title: getRecordFieldText(record, request.titleFieldName, TITLE_FIELD_CANDIDATES) || record.record_id,
      status: getRecordFieldText(record, request.statusFieldName, STATUS_FIELD_CANDIDATES) || undefined,
    }));
    await this.syncStore.upsertLarkBaseTickets(inputs);
  }

  private async getLarkRecordsInBatches(
    client: LarkClient,
    baseId: string,
    tableId: string,
    recordIds: string[],
  ): Promise<LarkBitableRecord[]> {
    const uniqueRecordIds = [...new Set(recordIds)];
    const recordsById = new Map<string, LarkBitableRecord>();
    let forbidden = 0;
    let absent = 0;
    for (const recordIdBatch of chunk(uniqueRecordIds, LARK_BATCH_GET_SIZE)) {
      const result = await client.batchGetRecords(baseId, tableId, recordIdBatch, {
        automaticFields: true,
      });
      for (const record of result.records) recordsById.set(record.record_id, record);
      forbidden += result.forbidden_record_ids.length;
      absent += result.absent_record_ids.length;
    }
    const missing = uniqueRecordIds.filter((recordId) => !recordsById.has(recordId)).length;
    if (forbidden > 0 || absent > 0 || missing > 0) {
      throw new Error(
        `LARK_BATCH_GET_INCOMPLETE:requested=${uniqueRecordIds.length}:forbidden=${forbidden}:absent=${absent}:missing=${missing}`,
      );
    }
    return uniqueRecordIds.map((recordId) => recordsById.get(recordId)!);
  }
}

function latestWatermark(
  entries: Array<{ updatedAt?: string; tiebreaker: string }>,
  current: { watermarkUpdatedAt: string; watermarkTiebreaker: string },
): { updatedAt: string; tiebreaker: string } {
  let latest = { updatedAt: current.watermarkUpdatedAt, tiebreaker: current.watermarkTiebreaker };
  for (const entry of entries) {
    if (!entry.updatedAt) continue;
    const compare = new Date(entry.updatedAt).getTime() - new Date(latest.updatedAt).getTime()
      || entry.tiebreaker.localeCompare(latest.tiebreaker);
    if (compare > 0) latest = { updatedAt: entry.updatedAt, tiebreaker: entry.tiebreaker };
  }
  return latest;
}

function isValidSourceTimestamp(value: string | undefined): value is string {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

export function buildLarkUpdatedSinceFilter(sourceUpdatedAtFieldName: string, threshold: number): string {
  if (!sourceUpdatedAtFieldName.trim() || /[\[\]]/.test(sourceUpdatedAtFieldName)) {
    throw new Error("Invalid Lark sourceUpdatedAtFieldName");
  }
  const date = new Date(threshold);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Lark incremental threshold");
  // Lark record filters use formula syntax. TODATE keeps the comparison in the
  // Bitable date domain instead of comparing its rendered string value.
  return `CurrentValue.[${sourceUpdatedAtFieldName}] >= TODATE(\"${date.toISOString()}\")`;
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
