import "dotenv/config";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
import { buildAuthenticatedLarkClient } from "../application/services/lark-auth-client.factory.js";
import { configureLarkAuthServiceDeps } from "../modules/lark-auth/lark-auth.service.js";
import { PostgresLarkTokenStore } from "../adapters/postgres/lark-token-store.js";
import { MeegleShellClient } from "../adapters/meegle/meegle-shell-client.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";
import type { PlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";
import type { GitHubPrDetails } from "../adapters/github/github-types.js";
import {
  createPostgresDatabase,
  ensurePostgresSchema,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";

const DEFAULT_MASTER_USER_ID = "a400632e-8d08-4ddf-977d-e8330b0adc5a";
const execFileAsync = promisify(execFile);
export const DEFAULT_PLATFORM_SYNC_CONFIG_PATH = fileURLToPath(
  new URL("../../config/platform-sync.local.json", import.meta.url),
);

const platformNameSchema = z.enum(["meegle", "github", "lark"]);
export type PlatformName = z.infer<typeof platformNameSchema>;

const platformSyncConfigSchema = z.object({
  meegle: z.array(z.object({
    projectKey: z.string().min(1),
    workItemTypeKeys: z.array(z.string().min(1)).min(1).optional(),
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
  })).default([]),
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
  help: boolean;
}

export interface SyncCounts {
  listed: number;
  skippedInactive: number;
  synced: number;
}

export interface PlatformSyncRunner {
  bulkSyncMeegleWorkitems(input: {
    masterUserId: string;
    projectKey: string;
    workItemTypeKeys?: string[];
  }): Promise<SyncCounts>;
  bulkSyncGitHubPullRequests(input: {
    repositories: Array<{ owner: string; repo: string }>;
  }): Promise<SyncCounts>;
  bulkSyncLarkBaseTickets(input: {
    masterUserId: string;
    baseId: string;
    tableId: string;
    larkBaseUrl?: string;
    titleFieldName?: string;
    statusFieldName?: string;
  }): Promise<SyncCounts>;
}

export type RunGhCommand = (args: string[]) => Promise<string>;

export interface PlatformSyncRunEntry {
  platform: PlatformName;
  target: string;
  ok: boolean;
  counts?: SyncCounts;
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
    throw new Error(`Unknown argument: ${arg}`);
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
        entries.push(await runTarget("meegle", target.projectKey, () => runner.bulkSyncMeegleWorkitems({
          masterUserId: args.masterUserId,
          projectKey: target.projectKey,
          workItemTypeKeys: target.workItemTypeKeys,
        })));
      }
      continue;
    }

    if (platform === "github") {
      for (const target of config.github) {
        entries.push(await runTarget("github", `${target.owner}/${target.repo}`, () => (
          runner.bulkSyncGitHubPullRequests({ repositories: [target] })
        )));
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

export async function syncGitHubPullRequestsWithGh(
  input: { repositories: Array<{ owner: string; repo: string }> },
  store: PlatformSyncStore,
  runGh: RunGhCommand = runGhCommand,
): Promise<SyncCounts> {
  let listed = 0;
  let synced = 0;

  for (const repository of input.repositories) {
    const pullRequests = parseGhPullRequestPages(await runGh([
      "api",
      "--paginate",
      "--slurp",
      "--method", "GET",
      `repos/${repository.owner}/${repository.repo}/pulls`,
      "-f", "state=open",
      "-f", "per_page=100",
    ]));
    listed += pullRequests.length;

    for (const listedPullRequest of pullRequests) {
      const pullNumber = getPullNumber(listedPullRequest);
      const pullRequest = parseGhPullRequest(await runGh([
        "api",
        "--method", "GET",
        `repos/${repository.owner}/${repository.repo}/pulls/${pullNumber}`,
      ]));
      await store.upsertGitHubPullRequest({
        owner: repository.owner,
        repo: repository.repo,
        pullRequest,
      });
      synced += 1;
    }
  }

  return { listed, skippedInactive: listed - synced, synced };
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
        `[platform-sync] platform=${entry.platform} target=${entry.target} listed=${entry.counts.listed} skipped_inactive=${entry.counts.skippedInactive} synced=${entry.counts.synced}\n`,
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

  const config = await readPlatformSyncConfig(args.configPath);
  const db = createPostgresDatabase(postgresUri);
  try {
    await ensurePostgresSchema(db);
    const larkTokenStore = new PostgresLarkTokenStore(db);
    configureLocalLarkAuth(larkTokenStore);
    const meegleShellClient = new MeegleShellClient();

    const service = new PlatformSyncService({
      store: new PostgresPlatformSyncStore(db),
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

    const result = await runPlatformSync(args, config, {
      bulkSyncMeegleWorkitems: (input) => service.bulkSyncMeegleWorkitems(input),
      bulkSyncLarkBaseTickets: (input) => service.bulkSyncLarkBaseTickets(input),
      bulkSyncGitHubPullRequests: (input) => syncGitHubPullRequestsWithGh(
        input,
        new PostgresPlatformSyncStore(db),
      ),
    });
    printResult(result);
    if (result.failed) {
      process.exitCode = 1;
    }
  } finally {
    await db.destroy();
  }
}

async function runGhCommand(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function parseGhPullRequestPages(stdout: string): Record<string, unknown>[] {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("gh returned an invalid pull request list");
  }
  const pages = parsed.every(Array.isArray) ? parsed : [parsed];
  const pullRequests = pages.flat();
  if (!pullRequests.every(isRecord)) {
    throw new Error("gh returned an invalid pull request entry");
  }
  return pullRequests;
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
