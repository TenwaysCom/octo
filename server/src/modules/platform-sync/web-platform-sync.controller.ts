import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";
import { createActionErrorEnvelope, getActionRunId } from "../../application/action-error-envelope.js";
import {
  executeIncrementalPlatformSyncTarget,
  PlatformSyncCoordinator,
  PlatformSyncCoordinatorError,
} from "../../application/services/platform-sync-coordinator.js";
import {
  platformSyncScopeKey,
  type IncrementalPlatformSyncTarget,
} from "../../domain/platform-sync.js";
import { PlatformSyncService } from "../../application/services/platform-sync.service.js";
import { MeegleShellClient } from "../../adapters/meegle/meegle-shell-client.js";
import { PostgresPlatformSyncCheckpointStore } from "../../adapters/postgres/platform-sync-checkpoint-store.js";
import { getSharedDatabase } from "../../adapters/postgres/database.js";
import { PostgresPlatformSyncLeaseStore } from "../../adapters/postgres/platform-sync-lease-store.js";
import { PostgresPlatformSyncRunStore } from "../../adapters/postgres/platform-sync-run-store.js";
import {
  PostgresPlatformSyncStatusStore,
  type PlatformSyncScopeRef,
  type PlatformSyncScopeStatus,
} from "../../adapters/postgres/platform-sync-status-store.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { getWebWorkspaceAccess } from "../lark-auth/web-workspace-access.js";

const DEFAULT_CONFIG_PATH = fileURLToPath(new URL("../../../config/platform-sync.local.json", import.meta.url));
const sourceIdSchema = z.enum([
  "lark-tickets",
  "meegle-user-stories",
  "meegle-tech-tasks",
  "meegle-production-bugs",
  "github-odoo-eu",
  "github-odoo-uk",
  "github-odoo-us",
]);
const requestSchema = z.object({ actionRunId: z.string().min(1) });
const configSchema = z.object({
  meegle: z.array(z.object({
    projectKey: z.string().min(1),
    workItemTypeKeys: z.array(z.string().min(1)).default([]),
    sourceUpdatedAtMqlFieldNames: z.record(z.string().min(1), z.string().min(1)).optional(),
  })).default([]),
  github: z.array(z.object({ owner: z.string().min(1), repo: z.string().min(1) })).default([]),
  larkBase: z.array(z.object({
    baseId: z.string().min(1),
    tableId: z.string().min(1),
    larkBaseUrl: z.string().url().optional(),
    titleFieldName: z.string().min(1).optional(),
    statusFieldName: z.string().min(1).optional(),
    sourceUpdatedAtFieldName: z.string().min(1).optional(),
  })).default([]),
});

type PlatformSyncConfig = z.infer<typeof configSchema>;
type WebSessionResult = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;
type WebPlatformSyncService = Pick<PlatformSyncService,
  "incrementalSyncMeegleWorkitems" | "incrementalSyncLarkBaseTickets" | "incrementalSyncGitHubPullRequests"
>;
type WebPlatformSyncCoordinator = Pick<PlatformSyncCoordinator, "runIncremental">;
type WebPlatformSyncStatusStore = Pick<PostgresPlatformSyncStatusStore, "list">;
type PlatformSyncSourceDefinition = {
  id: z.infer<typeof sourceIdSchema>;
  label: string;
  configured: boolean;
  scopes: PlatformSyncScopeRef[];
};

const GITHUB_SOURCES = [
  { id: "github-odoo-eu", label: "GitHub · Odoo EU", owner: "TenwaysCom", repo: "Tenways" },
  { id: "github-odoo-uk", label: "GitHub · Odoo UK", owner: "TenwaysCom", repo: "tenways-ukk" },
  { id: "github-odoo-us", label: "GitHub · Odoo US", owner: "TWS-lance", repo: "odoo_tenways" },
] as const;

const MEEGLE_SOURCES = [
  { id: "meegle-user-stories", label: "Meegle User Story", workItemTypeKey: "story" },
  { id: "meegle-tech-tasks", label: "Meegle Tech Task", workItemTypeKey: "66700acbf297a8f821b4b860" },
  { id: "meegle-production-bugs", label: "Meegle Production Bug", workItemTypeKey: "6932e40429d1cd8aac635c82" },
] as const;

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return undefined;
  }
}

async function loadPlatformSyncConfig(path = DEFAULT_CONFIG_PATH): Promise<PlatformSyncConfig> {
  return configSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

function sourceDefinitions(config: PlatformSyncConfig): PlatformSyncSourceDefinition[] {
  return [
    {
      id: "lark-tickets",
      label: "Lark Ticket",
      configured: config.larkBase.length > 0,
      scopes: config.larkBase.map((target) => ({ platform: "lark" as const, scopeKey: `${target.baseId}/${target.tableId}` })),
    },
    ...MEEGLE_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      configured: config.meegle.some((target) => target.workItemTypeKeys.includes(source.workItemTypeKey)),
      scopes: config.meegle.filter((target) => target.workItemTypeKeys.includes(source.workItemTypeKey))
        .map((target) => ({ platform: "meegle" as const, scopeKey: `${target.projectKey}/${source.workItemTypeKey}` })),
    })),
    ...GITHUB_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      configured: config.github.some((target) => target.owner === source.owner && target.repo === source.repo),
      scopes: config.github.filter((target) => target.owner === source.owner && target.repo === source.repo)
        .map((target) => ({ platform: "github" as const, scopeKey: `${target.owner}/${target.repo}` })),
    })),
  ];
}

export function createWebPlatformSyncController(deps: {
  service?: WebPlatformSyncService;
  coordinator?: WebPlatformSyncCoordinator;
  statusStore?: WebPlatformSyncStatusStore;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
  loadConfig?: () => Promise<PlatformSyncConfig>;
} = {}) {
  // Meegle's HTTP API cannot filter by source update time. Web incremental
  // sync therefore uses the same CLI/MQL adapter as the incremental command.
  const service = deps.service ?? new PlatformSyncService({
    createMeegleClient: async () => new MeegleShellClient(),
  });
  let coordinator = deps.coordinator;
  const getCoordinator = () => {
    if (coordinator) return coordinator;
    const db = getSharedDatabase();
    coordinator = new PlatformSyncCoordinator({
      checkpointStore: new PostgresPlatformSyncCheckpointStore(db),
      runStore: new PostgresPlatformSyncRunStore(db),
      leaseStore: new PostgresPlatformSyncLeaseStore(db),
    });
    return coordinator;
  };
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;
  const loadConfig = deps.loadConfig ?? loadPlatformSyncConfig;
  let statusStore = deps.statusStore;
  const getStatusStore = () => {
    statusStore ??= new PostgresPlatformSyncStatusStore(getSharedDatabase());
    return statusStore;
  };

  async function sessionFor(cookieHeader: string | undefined) {
    const session = await ensureSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
    return session.ok ? session : undefined;
  }

  return {
    async list(input: { cookieHeader: string | undefined }) {
      const session = await sessionFor(input.cookieHeader);
      if (!session) return unauthorized();
      if (!getWebWorkspaceAccess(session.role).platformSync) return forbidden();
      try {
        const definitions = sourceDefinitions(await loadConfig());
        const statuses = await getStatusStore().list(uniqueScopes(definitions.flatMap((source) => source.scopes)));
        return { statusCode: 200, body: { ok: true as const, data: { sources: projectSourceStatuses(definitions, statuses) } } };
      } catch {
        return { statusCode: 503, body: { ok: false as const, error: { errorCode: "SYNC_CONFIGURATION_UNAVAILABLE", errorMessage: "同步配置暂时不可用。" } } };
      }
    },

    async sync(input: { cookieHeader: string | undefined; sourceId: unknown; body: unknown }) {
      const session = await sessionFor(input.cookieHeader);
      if (!session) return unauthorized();
      if (!getWebWorkspaceAccess(session.role).platformSync) return forbidden();
      try {
        const sourceId = sourceIdSchema.parse(input.sourceId);
        const request = requestSchema.parse(input.body);
        const config = await loadConfig();
        const data = await syncSource(service, getCoordinator(), config, session.masterUserId, sourceId, request.actionRunId);
        return { statusCode: 200, body: { ok: true as const, data: { sourceId, actionRunId: request.actionRunId, ...data } } };
      } catch (error) {
        if (error instanceof ZodError) {
          return {
            statusCode: 400,
            body: {
              ok: false as const,
              error: createActionErrorEnvelope({
                module: "platform-sync",
                stage: "server.action.received",
                errorCode: "INVALID_REQUEST",
                errorMessage: error.message,
                actionRunId: getActionRunId(input.body),
              }),
            },
          };
        }
        const code = error instanceof Error && error.message === "SYNC_SOURCE_NOT_CONFIGURED"
          ? "SYNC_SOURCE_NOT_CONFIGURED"
          : error instanceof PlatformSyncCoordinatorError && error.code === "SYNC_CHECKPOINT_REQUIRED"
            ? "SYNC_CHECKPOINT_REQUIRED"
            : error instanceof PlatformSyncCoordinatorError && error.code === "SYNC_ALREADY_RUNNING"
              ? "SYNC_ALREADY_RUNNING"
              : "SYNC_FAILED";
        const statusCode = code === "SYNC_CHECKPOINT_REQUIRED" || code === "SYNC_ALREADY_RUNNING" ? 409 : 502;
        const errorMessage = code === "SYNC_SOURCE_NOT_CONFIGURED"
          ? "该数据源尚未配置。"
          : code === "SYNC_CHECKPOINT_REQUIRED"
            ? "尚未建立安全的增量水位，请先执行历史初始化。"
            : code === "SYNC_ALREADY_RUNNING"
              ? "该数据源正在同步，请稍后查看结果。"
              : "同步失败，请稍后重试。";
        const stage = code === "SYNC_ALREADY_RUNNING"
          ? "server.sync.lease_acquire"
          : code === "SYNC_CHECKPOINT_REQUIRED"
            ? "server.sync.checkpoint"
            : code === "SYNC_SOURCE_NOT_CONFIGURED"
              ? "server.sync.configuration"
              : "server.workflow.failed";
        return {
          statusCode,
          body: {
            ok: false as const,
            error: createActionErrorEnvelope({
              module: "platform-sync",
              stage,
              errorCode: code,
              errorMessage,
              actionRunId: getActionRunId(input.body),
            }),
          },
        };
      }
    },
  };
}

function uniqueScopes(scopes: PlatformSyncScopeRef[]): PlatformSyncScopeRef[] {
  return [...new Map(scopes.map((scope) => [`${scope.platform}:${scope.scopeKey}`, scope])).values()];
}

function projectSourceStatuses(
  definitions: ReturnType<typeof sourceDefinitions>,
  statuses: PlatformSyncScopeStatus[],
) {
  const byScope = new Map(statuses.map((status) => [`${status.platform}:${status.scopeKey}`, status]));
  return definitions.map(({ scopes, ...source }) => {
    const sourceStatuses = scopes.map((scope) => byScope.get(`${scope.platform}:${scope.scopeKey}`)).filter(Boolean) as PlatformSyncScopeStatus[];
    const latest = sourceStatuses.reduce<PlatformSyncScopeStatus | undefined>((current, candidate) => {
      if (!candidate.lastRunAt) return current;
      if (!current?.lastRunAt || candidate.lastRunAt > current.lastRunAt) return candidate;
      return current;
    }, undefined);
    const running = sourceStatuses.find((status) => status.runStatus === "running");
    const nextRunAt = sourceStatuses.filter((status) => status.scheduled && status.nextRunAt)
      .map((status) => status.nextRunAt!)
      .sort()[0];
    return {
      ...source,
      scheduled: sourceStatuses.some((status) => status.scheduled),
      nextRunAt,
      blockedReason: sourceStatuses.find((status) => status.blockedReason)?.blockedReason,
      runStatus: running?.runStatus ?? latest?.runStatus,
      runTrigger: running?.runTrigger ?? latest?.runTrigger,
      lastRunAt: latest?.lastRunAt,
      lastCompletedAt: latest?.lastCompletedAt,
      lastErrorCode: latest?.lastErrorCode,
    };
  });
}

function unauthorized() {
  return { statusCode: 401, body: { ok: false as const, error: { errorCode: "UNAUTHORIZED", errorMessage: "登录已失效，请重新登录。" } } };
}

function forbidden() {
  return { statusCode: 403, body: { ok: false as const, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权执行数据同步。" } } };
}

async function syncSource(
  service: WebPlatformSyncService,
  coordinator: WebPlatformSyncCoordinator,
  config: PlatformSyncConfig,
  masterUserId: string,
  sourceId: z.infer<typeof sourceIdSchema>,
  actionRunId: string,
) {
  if (sourceId === "lark-tickets") {
    if (config.larkBase.length === 0) throw new Error("SYNC_SOURCE_NOT_CONFIGURED");
    return summarizeSyncResults(await Promise.all(config.larkBase.map(async (target) => {
      const scheduledTarget: IncrementalPlatformSyncTarget = {
        platform: "lark",
        ...target,
        sourceUpdatedAtFieldName: target.sourceUpdatedAtFieldName ?? "最后更新时间",
      };
      return runTarget(coordinator, service, scheduledTarget, masterUserId, actionRunId);
    })));
  }
  const meegleSource = MEEGLE_SOURCES.find((item) => item.id === sourceId);
  const meegleTarget = meegleSource && config.meegle.find((target) => target.workItemTypeKeys.includes(meegleSource.workItemTypeKey));
  if (meegleSource && meegleTarget) {
    const workItemTypeKey = meegleSource.workItemTypeKey;
    const sourceUpdatedAtMqlFieldName = meegleTarget.sourceUpdatedAtMqlFieldNames?.[workItemTypeKey];
    return summarizeSyncResults([await runTarget(coordinator, service, {
        platform: "meegle",
        projectKey: meegleTarget.projectKey,
        workItemTypeKey,
        sourceUpdatedAtMqlFieldName,
      }, masterUserId, actionRunId)]);
  }
  const source = GITHUB_SOURCES.find((item) => item.id === sourceId);
  const target = source && config.github.find((item) => item.owner === source.owner && item.repo === source.repo);
  if (!source || !target) throw new Error("SYNC_SOURCE_NOT_CONFIGURED");
  return summarizeSyncResults([await runTarget(coordinator, service, {
      platform: "github",
      owner: target.owner,
      repo: target.repo,
    }, undefined, actionRunId)]);
}

function runTarget(
  coordinator: WebPlatformSyncCoordinator,
  service: WebPlatformSyncService,
  target: IncrementalPlatformSyncTarget,
  masterUserId: string | undefined,
  actionRunId: string,
) {
  return coordinator.runIncremental({
    platform: target.platform,
    scopeKey: platformSyncScopeKey(target),
    trigger: "manual",
    actionRunId,
    execute: (checkpoint, context) => executeIncrementalPlatformSyncTarget(service, {
      target,
      masterUserId,
      checkpoint,
      actionRunId: context.actionRunId,
    }),
  });
}

type SyncSummary = {
  sourcesSynced: number;
  listed: number;
  skippedInactive: number;
  synced: number;
};

function summarizeSyncResults(results: Array<{ listed: number; skippedInactive: number; synced: number }>): SyncSummary {
  return results.reduce<SyncSummary>((summary, result) => ({
    sourcesSynced: summary.sourcesSynced + 1,
    listed: summary.listed + result.listed,
    skippedInactive: summary.skippedInactive + result.skippedInactive,
    synced: summary.synced + result.synced,
  }), { sourcesSynced: 0, listed: 0, skippedInactive: 0, synced: 0 });
}
