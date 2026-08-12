import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";
import { PlatformSyncService } from "../../application/services/platform-sync.service.js";
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
  meegle: z.array(z.object({ projectKey: z.string().min(1), workItemTypeKeys: z.array(z.string().min(1)).default([]) })).default([]),
  github: z.array(z.object({ owner: z.string().min(1), repo: z.string().min(1) })).default([]),
  larkBase: z.array(z.object({
    baseId: z.string().min(1),
    tableId: z.string().min(1),
    larkBaseUrl: z.string().url().optional(),
    titleFieldName: z.string().min(1).optional(),
    statusFieldName: z.string().min(1).optional(),
  })).default([]),
});

type PlatformSyncConfig = z.infer<typeof configSchema>;
type WebSessionResult = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;

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

function sourceDefinitions(config: PlatformSyncConfig) {
  return [
    { id: "lark-tickets", label: "Lark Ticket", configured: config.larkBase.length > 0 },
    ...MEEGLE_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      configured: config.meegle.some((target) => target.workItemTypeKeys.includes(source.workItemTypeKey)),
    })),
    ...GITHUB_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      configured: config.github.some((target) => target.owner === source.owner && target.repo === source.repo),
    })),
  ];
}

export function createWebPlatformSyncController(deps: {
  service?: Pick<PlatformSyncService, "bulkSyncMeegleWorkitems" | "bulkSyncLarkBaseTickets" | "bulkSyncGitHubPullRequests">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
  loadConfig?: () => Promise<PlatformSyncConfig>;
} = {}) {
  const service = deps.service ?? new PlatformSyncService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;
  const loadConfig = deps.loadConfig ?? loadPlatformSyncConfig;

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
        return { statusCode: 200, body: { ok: true as const, data: { sources: sourceDefinitions(await loadConfig()) } } };
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
        const data = await syncSource(service, config, session.masterUserId, sourceId, request.actionRunId);
        return { statusCode: 200, body: { ok: true as const, data: { sourceId, ...data } } };
      } catch (error) {
        if (error instanceof ZodError) {
          return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        }
        const code = error instanceof Error && error.message === "SYNC_SOURCE_NOT_CONFIGURED"
          ? "SYNC_SOURCE_NOT_CONFIGURED"
          : "SYNC_FAILED";
        return { statusCode: 502, body: { ok: false as const, error: { errorCode: code, errorMessage: code === "SYNC_SOURCE_NOT_CONFIGURED" ? "该数据源尚未配置。" : "同步失败，请稍后重试。" } } };
      }
    },
  };
}

function unauthorized() {
  return { statusCode: 401, body: { ok: false as const, error: { errorCode: "UNAUTHORIZED", errorMessage: "登录已失效，请重新登录。" } } };
}

function forbidden() {
  return { statusCode: 403, body: { ok: false as const, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权执行数据同步。" } } };
}

async function syncSource(
  service: Pick<PlatformSyncService, "bulkSyncMeegleWorkitems" | "bulkSyncLarkBaseTickets" | "bulkSyncGitHubPullRequests">,
  config: PlatformSyncConfig,
  masterUserId: string,
  sourceId: z.infer<typeof sourceIdSchema>,
  actionRunId: string,
) {
  if (sourceId === "lark-tickets") {
    if (config.larkBase.length === 0) throw new Error("SYNC_SOURCE_NOT_CONFIGURED");
    return summarizeSyncResults(await Promise.all(config.larkBase.map((target) => (
      service.bulkSyncLarkBaseTickets({ masterUserId, ...target, cleanAfterSync: true, actionRunId })
    ))));
  }
  const meegleSource = MEEGLE_SOURCES.find((item) => item.id === sourceId);
  const meegleTarget = meegleSource && config.meegle.find((target) => target.workItemTypeKeys.includes(meegleSource.workItemTypeKey));
  if (meegleSource && meegleTarget) {
    return summarizeSyncResults([await service.bulkSyncMeegleWorkitems({
      masterUserId,
      projectKey: meegleTarget.projectKey,
      workItemTypeKeys: [meegleSource.workItemTypeKey],
      cleanAfterSync: true,
      actionRunId,
    })]);
  }
  const source = GITHUB_SOURCES.find((item) => item.id === sourceId);
  const target = source && config.github.find((item) => item.owner === source.owner && item.repo === source.repo);
  if (!source || !target) throw new Error("SYNC_SOURCE_NOT_CONFIGURED");
  return summarizeSyncResults([await service.bulkSyncGitHubPullRequests({ repositories: [target], cleanAfterSync: true, actionRunId })]);
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
