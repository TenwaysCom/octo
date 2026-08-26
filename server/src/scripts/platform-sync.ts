import "dotenv/config";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Kysely } from "kysely";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
import { PlatformSyncCoordinator } from "../application/services/platform-sync-coordinator.js";
import { buildAuthenticatedLarkClient } from "../application/services/lark-auth-client.factory.js";
import { configureLarkAuthServiceDeps } from "../modules/lark-auth/lark-auth.service.js";
import { PostgresLarkTokenStore } from "../adapters/postgres/lark-token-store.js";
import { MeegleShellClient } from "../adapters/meegle/meegle-shell-client.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";
import type { GitHubPullRequestSyncRef, PlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";
import {
  getMeegleWorkItemTypeCheckpointScope,
  PostgresPlatformSyncCheckpointStore,
} from "../adapters/postgres/platform-sync-checkpoint-store.js";
import type { PlatformSyncCheckpoint } from "../adapters/postgres/platform-sync-checkpoint-store.js";
import { PostgresPlatformSyncRunStore } from "../adapters/postgres/platform-sync-run-store.js";
import { PostgresPlatformSyncLeaseStore } from "../adapters/postgres/platform-sync-lease-store.js";
import type { GitHubPrDetails } from "../adapters/github/github-types.js";
import type { DatabaseSchema } from "../adapters/postgres/schema.js";
import {
  createPostgresDatabase,
  ensurePostgresSchema,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";

const DEFAULT_MASTER_USER_ID = "a400632e-8d08-4ddf-977d-e8330b0adc5a";
const DEFAULT_GITHUB_PR_LIMIT = 100;
const MAX_GITHUB_PR_LIMIT = 1000;
const GITHUB_INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;
const execFileAsync = promisify(execFile);
export const DEFAULT_PLATFORM_SYNC_CONFIG_PATH = fileURLToPath(
  new URL("../../config/platform-sync.local.json", import.meta.url),
);

const platformNameSchema = z.enum(["meegle", "github", "lark"]);
export type PlatformName = z.infer<typeof platformNameSchema>;
const githubPullRequestStateSchema = z.enum(["all", "closed", "merged"]);
export type GitHubPullRequestState = z.infer<typeof githubPullRequestStateSchema>;
type GitHubPullRequestSyncState = Exclude<GitHubPullRequestState, "all">;
const syncModeSchema = z.enum(["full", "incremental", "clean"]);
export type PlatformSyncMode = z.infer<typeof syncModeSchema>;
const platformSyncSchedulerSchema = z.object({
  enabled: z.boolean().default(false),
  pollIntervalSeconds: z.number().int().min(5).max(300).default(30),
  concurrency: z.number().int().min(1).max(8).default(2),
  leaseSeconds: z.number().int().min(60).max(3600).default(1200),
  intervalsMinutes: z.object({
    lark: z.number().int().min(1).max(1440).default(10),
    meegle: z.number().int().min(1).max(1440).default(15),
    github: z.number().int().min(1).max(1440).default(10),
  }).default({ lark: 10, meegle: 15, github: 10 }),
}).default({
  enabled: false,
  pollIntervalSeconds: 30,
  concurrency: 2,
  leaseSeconds: 1200,
  intervalsMinutes: { lark: 10, meegle: 15, github: 10 },
});

const platformSyncConfigSchema = z.object({
  meegle: z.array(z.object({
    projectKey: z.string().min(1),
    workItemTypeKeys: z.array(z.string().min(1)).min(1).optional(),
    sourceUpdatedAtMqlFieldNames: z.record(z.string().min(1), z.string().min(1)).default({}),
  })).default([]),
  github: z.array(z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
  })).default([]),
  larkBase: z.array(z.object({
    baseId: z.string().min(1),
    tableId: z.string().min(1),
    larkBaseUrl: z.string().url().optional(),
    titleFieldName: z.string().min(1).optional(),
    statusFieldName: z.string().min(1).optional(),
    sourceUpdatedAtFieldName: z.string().min(1).default("最后更新时间"),
  })).default([]),
  scheduler: platformSyncSchedulerSchema,
}).superRefine((value, context) => {
  if (value.meegle.length + value.github.length + value.larkBase.length === 0) {
    context.addIssue({
      code: "custom",
      message: "At least one Meegle, GitHub, or Lark Base target is required",
    });
  }
});

export type PlatformSyncConfig = z.infer<typeof platformSyncConfigSchema>;

export interface PlatformSyncScriptArgs {
  masterUserId: string;
  configPath: string;
  only?: PlatformName;
  meegleWorkItemTypeKey?: string;
  githubPullRequestState: GitHubPullRequestState;
  githubPullRequestLimit: number;
  mode: PlatformSyncMode;
  scope?: string;
  cleanAfterSync: boolean;
  help: boolean;
}

export interface SyncCounts {
  listed: number;
  skippedInactive: number;
  synced: number;
  cleaned?: number;
  stale?: number;
}

export interface IncrementalSyncCounts extends SyncCounts {
  watermarkUpdatedAt: string;
  watermarkTiebreaker: string;
}

export interface IncrementalScopeRunner<T> {
  getCheckpoint(scope: string): Promise<PlatformSyncCheckpoint | undefined>;
  sync(target: T, checkpoint: Required<Pick<PlatformSyncCheckpoint, "watermarkUpdatedAt" | "watermarkTiebreaker">>): Promise<IncrementalSyncCounts>;
  markSuccess(checkpoint: PlatformSyncCheckpoint, result: IncrementalSyncCounts): Promise<void>;
  markFailure(scope: string, error: unknown): Promise<void>;
}

export interface PlatformSyncRunner {
  bulkSyncMeegleWorkitems(input: {
    masterUserId: string;
    projectKey: string;
    workItemTypeKeys?: string[];
    sourceUpdatedAtMqlFieldNames?: Record<string, string>;
    cleanAfterSync: boolean;
  }): Promise<SyncCounts>;
  bulkSyncGitHubPullRequests(input: {
    repositories: Array<{ owner: string; repo: string }>;
    state: GitHubPullRequestSyncState;
    limit: number;
    cleanAfterSync: boolean;
  }): Promise<SyncCounts>;
  bulkSyncLarkBaseTickets(input: {
    masterUserId: string;
    baseId: string;
    tableId: string;
    larkBaseUrl?: string;
    titleFieldName?: string;
    statusFieldName?: string;
    sourceUpdatedAtFieldName?: string;
    cleanAfterSync: boolean;
  }): Promise<SyncCounts>;
}

export interface PlatformSyncCleanRunner {
  cleanMeegleProject(projectKey: string): Promise<SyncCounts>;
  cleanGitHubRepository(owner: string, repo: string): Promise<SyncCounts>;
  cleanLarkBase(baseId: string, tableId: string): Promise<SyncCounts>;
}

export type RunGhCommand = (args: string[]) => Promise<string>;

export interface PlatformSyncRunEntry {
  platform: PlatformName;
  target: string;
  ok: boolean;
  counts?: SyncCounts;
  watermarkUpdatedAt?: string;
  watermarkTiebreaker?: string;
  errorMessage?: string;
}

export interface PlatformSyncRunResult {
  entries: PlatformSyncRunEntry[];
  failed: boolean;
}

export function parsePlatformSyncArgs(argv: string[]): PlatformSyncScriptArgs {
  const args: PlatformSyncScriptArgs = {
    masterUserId: DEFAULT_MASTER_USER_ID,
    configPath: DEFAULT_PLATFORM_SYNC_CONFIG_PATH,
    githubPullRequestState: "all",
    githubPullRequestLimit: DEFAULT_GITHUB_PR_LIMIT,
    mode: "full",
    cleanAfterSync: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--user-id") {
      args.masterUserId = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--config") {
      args.configPath = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--only") {
      args.only = platformNameSchema.parse(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--meegle-work-item-type") {
      args.meegleWorkItemTypeKey = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--github-pr-state") {
      args.githubPullRequestState = githubPullRequestStateSchema.parse(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--github-pr-limit") {
      args.githubPullRequestLimit = parseGitHubPullRequestLimit(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      args.mode = syncModeSchema.parse(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--scope") {
      args.scope = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--clean-after-sync") {
      args.cleanAfterSync = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.mode === "incremental" && !args.only) {
    throw new Error("Incremental sync requires --only meegle|github|lark");
  }
  if (args.mode === "incremental" && args.only === "github" && !args.scope) {
    throw new Error("GitHub incremental sync requires --scope <owner/repo>");
  }
  if (args.mode === "incremental" && args.only !== "github" && args.scope) {
    throw new Error("--scope is only supported by GitHub incremental sync");
  }
  if (args.meegleWorkItemTypeKey && (args.mode !== "incremental" || args.only !== "meegle")) {
    throw new Error("--meegle-work-item-type is only supported by Meegle incremental sync");
  }
  if (args.mode === "full" && args.scope) {
    throw new Error("--scope is only supported by GitHub incremental sync");
  }
  if (args.mode === "clean" && args.scope) {
    throw new Error("--scope is not supported by clean mode; use --only to choose a configured platform");
  }
  return args;
}

export async function readPlatformSyncConfig(path: string): Promise<PlatformSyncConfig> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read platform sync config at ${path}: ${message}`);
  }

  try {
    return parsePlatformSyncConfig(JSON.parse(source));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid platform sync config at ${path}: ${message}`);
  }
}

export function parsePlatformSyncConfig(input: unknown): PlatformSyncConfig {
  return platformSyncConfigSchema.parse(input);
}

export function getMeegleIncrementalScopes(
  config: PlatformSyncConfig,
  workItemTypeKey?: string,
): Array<{
  scope: string;
  target: {
    projectKey: string;
    workItemTypeKeys: string[];
    sourceUpdatedAtMqlFieldNames: Record<string, string>;
  };
}> {
  return config.meegle.flatMap((target) => (target.workItemTypeKeys ?? [])
    .filter((configuredWorkItemTypeKey) => !workItemTypeKey || configuredWorkItemTypeKey === workItemTypeKey)
    .map((configuredWorkItemTypeKey) => {
      const sourceUpdatedAtMqlFieldName = target.sourceUpdatedAtMqlFieldNames[configuredWorkItemTypeKey];
      return {
        scope: getMeegleWorkItemTypeCheckpointScope(target.projectKey, configuredWorkItemTypeKey),
        target: {
          projectKey: target.projectKey,
          workItemTypeKeys: [configuredWorkItemTypeKey],
          sourceUpdatedAtMqlFieldNames: sourceUpdatedAtMqlFieldName ? { [configuredWorkItemTypeKey]: sourceUpdatedAtMqlFieldName } : {},
        },
      };
    }));
}

export async function runPlatformSync(
  args: PlatformSyncScriptArgs,
  config: PlatformSyncConfig,
  runner: PlatformSyncRunner,
): Promise<PlatformSyncRunResult> {
  const platforms: PlatformName[] = args.only ? [args.only] : ["meegle", "github", "lark"];
  const entries: PlatformSyncRunEntry[] = [];

  for (const platform of platforms) {
    if (platform === "meegle") {
      for (const target of config.meegle) {
        const workItemTypeKeys = target.workItemTypeKeys ?? [];
        if (workItemTypeKeys.length === 0) {
          entries.push(await runTarget("meegle", target.projectKey, () => runner.bulkSyncMeegleWorkitems({
            masterUserId: args.masterUserId,
            projectKey: target.projectKey,
            cleanAfterSync: args.cleanAfterSync,
          })));
          continue;
        }
        for (const workItemTypeKey of workItemTypeKeys) {
          const sourceUpdatedAtMqlFieldName = target.sourceUpdatedAtMqlFieldNames[workItemTypeKey];
          entries.push(await runTarget("meegle", getMeegleWorkItemTypeCheckpointScope(target.projectKey, workItemTypeKey), () => runner.bulkSyncMeegleWorkitems({
            masterUserId: args.masterUserId,
            projectKey: target.projectKey,
            workItemTypeKeys: [workItemTypeKey],
            sourceUpdatedAtMqlFieldNames: sourceUpdatedAtMqlFieldName ? { [workItemTypeKey]: sourceUpdatedAtMqlFieldName } : undefined,
            cleanAfterSync: args.cleanAfterSync,
          })));
        }
      }
      continue;
    }

    if (platform === "github") {
      for (const target of config.github) {
        const states: GitHubPullRequestSyncState[] = args.githubPullRequestState === "all"
          ? ["closed", "merged"]
          : [args.githubPullRequestState];
        for (const state of states) {
          entries.push(await runTarget("github", `${target.owner}/${target.repo} (${state})`, () => (
            runner.bulkSyncGitHubPullRequests({
              repositories: [target],
              state,
              limit: args.githubPullRequestLimit,
              cleanAfterSync: args.cleanAfterSync,
            })
          )));
        }
      }
      continue;
    }

    for (const target of config.larkBase) {
      entries.push(await runTarget("lark", `${target.baseId}/${target.tableId}`, () => runner.bulkSyncLarkBaseTickets({
        masterUserId: args.masterUserId,
        baseId: target.baseId,
        tableId: target.tableId,
        larkBaseUrl: target.larkBaseUrl,
        titleFieldName: target.titleFieldName,
        statusFieldName: target.statusFieldName,
        cleanAfterSync: args.cleanAfterSync,
      })));
    }
  }

  if (args.only && entries.length === 0) {
    entries.push({
      platform: args.only,
      target: "configuration",
      ok: false,
      errorMessage: `No ${args.only} targets configured`,
    });
  }

  return { entries, failed: entries.some((entry) => !entry.ok) };
}

export async function runPlatformSyncCleaning(
  args: PlatformSyncScriptArgs,
  config: PlatformSyncConfig,
  runner: PlatformSyncCleanRunner,
): Promise<PlatformSyncRunResult> {
  const platforms: PlatformName[] = args.only ? [args.only] : ["meegle", "github", "lark"];
  const entries: PlatformSyncRunEntry[] = [];

  for (const platform of platforms) {
    if (platform === "meegle") {
      for (const target of config.meegle) {
        entries.push(await runTarget("meegle", target.projectKey, () => runner.cleanMeegleProject(target.projectKey)));
      }
      continue;
    }
    if (platform === "github") {
      for (const target of config.github) {
        entries.push(await runTarget("github", `${target.owner}/${target.repo}`, () => runner.cleanGitHubRepository(target.owner, target.repo)));
      }
      continue;
    }
    for (const target of config.larkBase) {
      entries.push(await runTarget("lark", `${target.baseId}/${target.tableId}`, () => runner.cleanLarkBase(target.baseId, target.tableId)));
    }
  }

  if (args.only && entries.length === 0) {
    entries.push({ platform: args.only, target: "configuration", ok: false, errorMessage: `No ${args.only} targets configured` });
  }
  return { entries, failed: entries.some((entry) => !entry.ok) };
}

export async function runIncrementalScopes<T>(
  platform: Extract<PlatformName, "meegle" | "lark">,
  targets: Array<{ scope: string; target: T }>,
  runner: IncrementalScopeRunner<T>,
): Promise<PlatformSyncRunResult> {
  const entries: PlatformSyncRunEntry[] = [];
  if (targets.length === 0) {
    return {
      entries: [{ platform, target: "configuration", ok: false, errorMessage: `No ${platform} targets configured` }],
      failed: true,
    };
  }
  for (const entry of targets) {
    try {
      const checkpoint = await runner.getCheckpoint(entry.scope);
      if (!checkpoint?.watermarkUpdatedAt || !checkpoint.watermarkTiebreaker) {
        throw new Error(`${platform} checkpoint has no source watermark for ${entry.scope}`);
      }
      const result = await runner.sync(entry.target, checkpoint as Required<Pick<PlatformSyncCheckpoint, "watermarkUpdatedAt" | "watermarkTiebreaker">>);
      await runner.markSuccess(checkpoint, result);
      entries.push({
        platform,
        target: entry.scope,
        ok: true,
        counts: result,
        watermarkUpdatedAt: result.watermarkUpdatedAt,
        watermarkTiebreaker: result.watermarkTiebreaker,
      });
    } catch (error) {
      const syncErrorMessage = errorMessage(error);
      let failureMessage = syncErrorMessage;
      try {
        await runner.markFailure(entry.scope, error);
      } catch (checkpointError) {
        failureMessage = `${syncErrorMessage}; failed to record checkpoint error: ${errorMessage(checkpointError)}`;
      }
      entries.push({ platform, target: entry.scope, ok: false, errorMessage: failureMessage });
    }
  }
  return { entries, failed: entries.some((entry) => !entry.ok) };
}

async function runCoordinatedIncrementalScopes<T>(
  platform: Extract<PlatformName, "meegle" | "lark">,
  targets: Array<{ scope: string; target: T }>,
  run: (entry: { scope: string; target: T }) => Promise<IncrementalSyncCounts>,
): Promise<PlatformSyncRunResult> {
  if (targets.length === 0) {
    return {
      entries: [{ platform, target: "configuration", ok: false, errorMessage: `No ${platform} targets configured` }],
      failed: true,
    };
  }
  const entries: PlatformSyncRunEntry[] = [];
  for (const entry of targets) {
    try {
      const result = await run(entry);
      entries.push({
        platform,
        target: entry.scope,
        ok: true,
        counts: result,
        watermarkUpdatedAt: result.watermarkUpdatedAt,
        watermarkTiebreaker: result.watermarkTiebreaker,
      });
    } catch (error) {
      entries.push({ platform, target: entry.scope, ok: false, errorMessage: errorMessage(error) });
    }
  }
  return { entries, failed: entries.some((entry) => !entry.ok) };
}

export async function syncGitHubPullRequestsWithGh(
  input: {
    repositories: Array<{ owner: string; repo: string }>;
    state: GitHubPullRequestSyncState;
    limit: number;
  },
  store: PlatformSyncStore,
  runGh: RunGhCommand = runGhCommand,
): Promise<SyncCounts & { refs: GitHubPullRequestSyncRef[] }> {
  let listed = 0;
  let synced = 0;
  const refs: GitHubPullRequestSyncRef[] = [];

  for (const repository of input.repositories) {
    const pullRequests = parseGhPullRequestList(await runGh([
      "pr",
      "list",
      "--repo", `${repository.owner}/${repository.repo}`,
      "--state", input.state,
      "--limit", String(input.limit),
      "--json", "number",
    ]));
    listed += pullRequests.length;

    for (const listedPullRequest of pullRequests) {
      const pullNumber = getPullNumber(listedPullRequest);
      const pullRequest = parseGhPullRequest(await runGh([
        "api",
        "--method", "GET",
        `repos/${repository.owner}/${repository.repo}/pulls/${pullNumber}`,
      ]));
      if (input.state === "closed" && pullRequest.merged_at) {
        continue;
      }
      await store.upsertGitHubPullRequest({
        owner: repository.owner,
        repo: repository.repo,
        pullRequest,
      });
      synced += 1;
      refs.push({ owner: repository.owner, repo: repository.repo, pullNumber });
    }
  }

  return { listed, skippedInactive: listed - synced, synced, refs };
}

export interface GitHubIncrementalSyncResult extends SyncCounts {
  refs: GitHubPullRequestSyncRef[];
  watermarkUpdatedAt: string;
  watermarkTiebreaker: string;
}

export async function syncIncrementalGitHubPullRequestsWithGh(
  input: {
    owner: string;
    repo: string;
    watermarkUpdatedAt: string;
    watermarkTiebreaker: string;
    limit: number;
  },
  store: PlatformSyncStore,
  runGh: RunGhCommand = runGhCommand,
): Promise<GitHubIncrementalSyncResult> {
  const searchSince = new Date(new Date(input.watermarkUpdatedAt).getTime() - GITHUB_INCREMENTAL_OVERLAP_MS);
  if (Number.isNaN(searchSince.getTime())) {
    throw new Error(`Invalid GitHub checkpoint watermark: ${input.watermarkUpdatedAt}`);
  }
  const listed = parseGhPullRequestList(await runGh([
    "pr", "list",
    "--repo", `${input.owner}/${input.repo}`,
    "--state", "all",
    "--search", `updated:>=${searchSince.toISOString()}`,
    "--limit", String(input.limit),
    "--json", "number",
  ]));
  if (listed.length >= input.limit) {
    throw new Error(`GitHub incremental result reached --github-pr-limit=${input.limit}; increase the limit before advancing the checkpoint`);
  }

  const details = await Promise.all(listed.map(async (item) => {
    const pullNumber = getPullNumber(item);
    const pullRequest = parseGhPullRequest(await runGh([
      "api", "--method", "GET",
      `repos/${input.owner}/${input.repo}/pulls/${pullNumber}`,
    ]));
    if (!isValidTimestamp(pullRequest.updated_at)) {
      throw new Error(`GitHub pull request #${pullNumber} is missing a valid updated_at`);
    }
    return pullRequest;
  }));
  const threshold = searchSince.getTime();
  const changed = details.filter((pullRequest) => new Date(pullRequest.updated_at).getTime() >= threshold)
    .sort(compareGitHubPullRequests);

  for (const pullRequest of changed) {
    await store.upsertGitHubPullRequest({ owner: input.owner, repo: input.repo, pullRequest });
  }

  const latest = changed.reduce((current, pullRequest) => {
    if (!current) return currentGitHubWatermark(input);
    return compareGitHubWatermarks(toGitHubWatermark(pullRequest), current) > 0
      ? toGitHubWatermark(pullRequest)
      : current;
  }, currentGitHubWatermark(input));
  return {
    listed: listed.length,
    skippedInactive: 0,
    synced: changed.length,
    refs: changed.map((pullRequest) => ({ owner: input.owner, repo: input.repo, pullNumber: pullRequest.number })),
    watermarkUpdatedAt: latest.updatedAt,
    watermarkTiebreaker: latest.tiebreaker,
  };
}

type GitHubWatermark = {
  updatedAt: string;
  tiebreaker: string;
};

function currentGitHubWatermark(input: {
  watermarkUpdatedAt: string;
  watermarkTiebreaker: string;
}): GitHubWatermark {
  return { updatedAt: input.watermarkUpdatedAt, tiebreaker: input.watermarkTiebreaker };
}

function toGitHubWatermark(pullRequest: GitHubPrDetails): GitHubWatermark {
  return {
    updatedAt: pullRequest.updated_at,
    tiebreaker: String(pullRequest.number).padStart(12, "0"),
  };
}

function compareGitHubPullRequests(left: GitHubPrDetails, right: GitHubPrDetails): number {
  return compareGitHubWatermarks(toGitHubWatermark(left), toGitHubWatermark(right));
}

function compareGitHubWatermarks(left: GitHubWatermark, right: GitHubWatermark): number {
  const timestampOrder = new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
  return timestampOrder || left.tiebreaker.localeCompare(right.tiebreaker);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function parseGitHubScope(scope: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = scope.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error("--scope must be an exact GitHub owner/repo value");
  }
  return { owner, repo };
}

async function runTarget(
  platform: PlatformName,
  target: string,
  operation: () => Promise<SyncCounts>,
): Promise<PlatformSyncRunEntry> {
  try {
    return { platform, target, ok: true, counts: await operation() };
  } catch (error) {
    return {
      platform,
      target,
      ok: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readNextArg(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printHelp(): void {
  process.stdout.write([
    "Usage: pnpm --dir server platform:sync [options]",
    "",
    "Options:",
    "  --only <meegle|github|lark>  Sync one configured platform only",
    "  --mode <full|incremental|clean>  Full/incremental sync cleans by default; clean only reads local snapshots",
    "  --meegle-work-item-type <type>  One Meegle type for incremental mode",
    "  --scope <owner/repo>          GitHub checkpoint scope for incremental mode",
    "  --clean-after-sync            Compatibility flag; cleaning is already enabled for every sync mode",
    "  --github-pr-state <all|closed|merged>  GitHub PR state (default all)",
    `  --github-pr-limit <1-${MAX_GITHUB_PR_LIMIT}>  GitHub PRs per repository (default ${DEFAULT_GITHUB_PR_LIMIT})`,
    `  --user-id <id>               Lark identity (default ${DEFAULT_MASTER_USER_ID})`,
    `  --config <path>              Config file (default ${DEFAULT_PLATFORM_SYNC_CONFIG_PATH})`,
    "  --help, -h                   Show this help",
    "",
  ].join("\n"));
}

function printResult(result: PlatformSyncRunResult): void {
  for (const entry of result.entries) {
    if (entry.ok && entry.counts) {
      process.stdout.write(
        `[platform-sync] platform=${entry.platform} target=${entry.target} listed=${entry.counts.listed} skipped_inactive=${entry.counts.skippedInactive} synced=${entry.counts.synced} cleaned=${entry.counts.cleaned ?? 0} stale=${entry.counts.stale ?? 0}${entry.watermarkUpdatedAt && entry.watermarkTiebreaker ? ` watermark=${entry.watermarkUpdatedAt}/${entry.watermarkTiebreaker}` : ""}\n`,
      );
      continue;
    }
    process.stderr.write(
      `[platform-sync] platform=${entry.platform} target=${entry.target} failed=${entry.errorMessage ?? "unknown"}\n`,
    );
  }
}

async function main(): Promise<void> {
  const args = parsePlatformSyncArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const postgresUri = getDefaultPostgresUri();
  if (!postgresUri) {
    throw new Error("POSTGRES_URI or DATABASE_URL is required");
  }

  const connection = await preparePostgresConnection(postgresUri);
  const db = createPostgresDatabase(connection.postgresUri);
  try {
    await ensurePostgresSchema(db);
    const syncStore = new PostgresPlatformSyncStore(db);
    const runStore = new PostgresPlatformSyncRunStore(db);
    const checkpointStore = new PostgresPlatformSyncCheckpointStore(db);
    const coordinator = new PlatformSyncCoordinator({
      checkpointStore,
      runStore,
      leaseStore: new PostgresPlatformSyncLeaseStore(db),
    });
    if (args.mode === "incremental" && args.only === "github") {
      const { owner, repo } = parseGitHubScope(args.scope!);
      const cleaningService = new PlatformSyncService({ store: syncStore });
      const result = await coordinator.runIncremental({
        platform: "github",
        scopeKey: args.scope!,
        trigger: "cli",
        execute: async (checkpoint) => {
          const next = await syncIncrementalGitHubPullRequestsWithGh({
            owner,
            repo,
            watermarkUpdatedAt: checkpoint.watermarkUpdatedAt,
            watermarkTiebreaker: checkpoint.watermarkTiebreaker,
            limit: args.githubPullRequestLimit,
          }, syncStore);
          const cleaned = await cleaningService.cleanGitHubPullRequests(next.refs);
          return { ...next, cleaned };
        },
      });
      process.stdout.write(
        `[platform-sync] mode=incremental platform=github scope=${args.scope} listed=${result.listed} synced=${result.synced} cleaned=${result.cleaned ?? 0} watermark=${result.watermarkUpdatedAt}/${result.watermarkTiebreaker}\n`,
      );
      return;
    }

    const config = await readPlatformSyncConfig(args.configPath);
    if (args.mode === "clean") {
      const service = new PlatformSyncService({ store: syncStore });
      const result = await runPlatformSyncCleaning(args, config, createPlatformSyncCleanRunner(db, service, coordinator));
      printResult(result);
      if (result.failed) process.exitCode = 1;
      return;
    }
    const larkTokenStore = new PostgresLarkTokenStore(db);
    configureLocalLarkAuth(larkTokenStore);
    const meegleShellClient = new MeegleShellClient();

    const service = new PlatformSyncService({
      store: syncStore,
      createMeegleClient: async () => meegleShellClient,
      createLarkClient: async ({ masterUserId, larkBaseUrl }) => {
        const { client } = await buildAuthenticatedLarkClient(
          masterUserId,
          larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.feishu.cn",
          { getLarkTokenStore: () => larkTokenStore },
        );
        return client;
      },
    });

    if (args.mode === "incremental" && (args.only === "meegle" || args.only === "lark")) {
      const config = await readPlatformSyncConfig(args.configPath);
      const result = args.only === "meegle"
        ? await runCoordinatedIncrementalScopes(
          "meegle",
          getMeegleIncrementalScopes(config, args.meegleWorkItemTypeKey),
          async ({ scope, target }) => coordinator.runIncremental({
            platform: "meegle",
            scopeKey: scope,
            trigger: "cli",
            execute: (checkpoint, context) => service.incrementalSyncMeegleWorkitems({
              masterUserId: args.masterUserId,
              projectKey: target.projectKey,
              workItemTypeKeys: target.workItemTypeKeys,
              sourceUpdatedAtMqlFieldNames: target.sourceUpdatedAtMqlFieldNames,
              cleanAfterSync: args.cleanAfterSync,
              actionRunId: context.actionRunId,
              ...checkpoint,
            }),
          }) as Promise<IncrementalSyncCounts>,
        )
        : await runCoordinatedIncrementalScopes(
          "lark",
          config.larkBase.map((target) => ({ scope: `${target.baseId}/${target.tableId}`, target })),
          async ({ scope, target }) => coordinator.runIncremental({
            platform: "lark",
            scopeKey: scope,
            trigger: "cli",
            execute: (checkpoint, context) => service.incrementalSyncLarkBaseTickets({
              masterUserId: args.masterUserId,
              ...target,
              cleanAfterSync: args.cleanAfterSync,
              actionRunId: context.actionRunId,
              ...checkpoint,
            }),
          }) as Promise<IncrementalSyncCounts>,
        );
      printResult(result);
      if (result.failed) process.exitCode = 1;
      return;
    }

    const githubFullScopeStartedAt = new Map<string, string>();
    const result = await runPlatformSync(args, config, {
      bulkSyncMeegleWorkitems: (input) => coordinator.runExclusive({
        platform: "meegle",
        scopeKey: getMeegleWorkItemTypeCheckpointScope(input.projectKey, input.workItemTypeKeys?.[0] ?? "all"),
        mode: "full",
        cleanAfterSync: input.cleanAfterSync,
        trigger: "cli",
        execute: async ({ startedAt }) => {
          const counts = await service.bulkSyncMeegleWorkitems(input);
          return { ...counts, stale: await syncStore.markMeegleWorkitemsUnseenStale(input.projectKey, startedAt, input.workItemTypeKeys?.[0]) };
        },
      }),
      bulkSyncLarkBaseTickets: (input) => coordinator.runExclusive({
        platform: "lark",
        scopeKey: `${input.baseId}/${input.tableId}`,
        mode: "full",
        cleanAfterSync: input.cleanAfterSync,
        trigger: "cli",
        execute: async ({ startedAt }) => {
          const counts = await service.bulkSyncLarkBaseTickets(input);
          return { ...counts, stale: await syncStore.markLarkBaseTicketsUnseenStale(input.baseId, input.tableId, startedAt) };
        },
      }),
      bulkSyncGitHubPullRequests: async (input) => {
        const repository = input.repositories[0];
        const scopeKey = `${repository.owner}/${repository.repo}`;
        return coordinator.runExclusive({
          platform: "github",
          scopeKey,
          mode: "full",
          cleanAfterSync: input.cleanAfterSync,
          trigger: "cli",
          execute: async ({ startedAt }) => {
            const counts = await syncGitHubPullRequestsWithGh(input, syncStore);
            const cleaned = await service.cleanGitHubPullRequests(counts.refs);
            if (args.githubPullRequestState === "all" && input.state === "closed") {
              githubFullScopeStartedAt.set(scopeKey, startedAt);
            }
            const fullScopeStartedAt = githubFullScopeStartedAt.get(scopeKey);
            const stale = args.githubPullRequestState === "all" && input.state === "merged" && fullScopeStartedAt
              ? await syncStore.markGitHubPullRequestsUnseenStale(repository.owner, repository.repo, fullScopeStartedAt)
              : 0;
            return { ...counts, cleaned, stale };
          },
        });
      },
    });
    printResult(result);
    if (result.failed) {
      process.exitCode = 1;
    }
  } finally {
    await db.destroy();
    await connection.close();
  }
}

function createPlatformSyncCleanRunner(
  db: Kysely<DatabaseSchema>,
  service: PlatformSyncService,
  coordinator: PlatformSyncCoordinator,
): PlatformSyncCleanRunner {
  return {
    async cleanMeegleProject(projectKey) {
      return coordinator.runExclusive({
        platform: "meegle",
        scopeKey: projectKey,
        mode: "clean",
        cleanAfterSync: false,
        trigger: "cli",
        execute: async () => {
          const rows = await db.selectFrom("meegle_workitem_syncs")
            .select(["project_key", "work_item_type_key", "work_item_id"])
            .where("project_key", "=", projectKey)
            .execute();
          const cleaned = await service.cleanMeegleWorkitems(rows.map((row) => ({
            projectKey: row.project_key, workItemTypeKey: row.work_item_type_key, workItemId: row.work_item_id,
          })));
          return { listed: rows.length, skippedInactive: 0, synced: 0, cleaned };
        },
      });
    },
    async cleanGitHubRepository(owner, repo) {
      return coordinator.runExclusive({
        platform: "github",
        scopeKey: `${owner}/${repo}`,
        mode: "clean",
        cleanAfterSync: false,
        trigger: "cli",
        execute: async () => {
          const rows = await db.selectFrom("github_pr_syncs")
            .select(["owner", "repo", "pull_number"])
            .where("owner", "=", owner).where("repo", "=", repo)
            .execute();
          const cleaned = await service.cleanGitHubPullRequests(rows.map((row) => ({
            owner: row.owner, repo: row.repo, pullNumber: row.pull_number,
          })));
          return { listed: rows.length, skippedInactive: 0, synced: 0, cleaned };
        },
      });
    },
    async cleanLarkBase(baseId, tableId) {
      return coordinator.runExclusive({
        platform: "lark",
        scopeKey: `${baseId}/${tableId}`,
        mode: "clean",
        cleanAfterSync: false,
        trigger: "cli",
        execute: async () => {
          const rows = await db.selectFrom("lark_base_ticket_syncs")
            .select(["base_id", "table_id", "record_id"])
            .where("base_id", "=", baseId).where("table_id", "=", tableId)
            .execute();
          const cleaned = await service.cleanLarkBaseTickets(rows.map((row) => ({
            baseId: row.base_id, tableId: row.table_id, recordId: row.record_id,
          })));
          return { listed: rows.length, skippedInactive: 0, synced: 0, cleaned };
        },
      });
    },
  };
}

async function runGhCommand(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function parseGitHubPullRequestLimit(value: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GITHUB_PR_LIMIT) {
    throw new Error(`--github-pr-limit must be an integer from 1 to ${MAX_GITHUB_PR_LIMIT}`);
  }
  return limit;
}

function parseGhPullRequestList(stdout: string): Record<string, unknown>[] {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("gh returned an invalid pull request list");
  }
  if (!parsed.every(isRecord)) {
    throw new Error("gh returned an invalid pull request entry");
  }
  return parsed;
}

function parseGhPullRequest(stdout: string): GitHubPrDetails {
  const parsed = JSON.parse(stdout) as unknown;
  if (!isRecord(parsed) || typeof parsed.number !== "number" || typeof parsed.title !== "string" || typeof parsed.html_url !== "string") {
    throw new Error("gh returned an invalid pull request detail");
  }
  return parsed as unknown as GitHubPrDetails;
}

function getPullNumber(pullRequest: Record<string, unknown>): number {
  if (typeof pullRequest.number !== "number" || !Number.isInteger(pullRequest.number) || pullRequest.number <= 0) {
    throw new Error("gh returned a pull request without a valid number");
  }
  return pullRequest.number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configureLocalLarkAuth(tokenStore: PostgresLarkTokenStore): void {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (appId && appSecret) {
    configureLarkAuthServiceDeps({ appId, appSecret, tokenStore });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    process.stderr.write(`[platform-sync] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
