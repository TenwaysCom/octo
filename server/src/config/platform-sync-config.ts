import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const DEFAULT_PLATFORM_SYNC_CONFIG_PATH = fileURLToPath(
  new URL("../../config/platform-sync.local.json", import.meta.url),
);

const syncTaskToggleSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
});

const shadowTaskSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  settleMinutes: z.number().int().min(1).max(10080).optional(),
  batchLimit: z.number().int().min(1).max(50).optional(),
  summaryTimeoutSeconds: z.number().int().min(30).max(1800).optional(),
  // Backward-compatible reads for existing local configs. New configs use
  // summaryTimeoutSeconds because the shared Ticket Summary provider is
  // selectable between DeepSeek and ZCode.
  deepSeekTimeoutSeconds: z.number().int().min(30).max(1800).optional(),
  acpTimeoutSeconds: z.number().int().min(30).max(1800).optional(),
});

const odooShTaskSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMinutes: z.number().int().min(1).max(1440).default(30),
  chatId: z.string().trim().min(1).default("oc_ebad023939d64fa0b0314d03307d8d77"),
});
const messageDeliveryTaskSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSeconds: z.number().int().min(1).max(3600).default(30),
  maxAttempts: z.number().int().min(1).max(20).default(3),
  retryDelaySeconds: z.number().int().min(1).max(86400).default(60),
  sendTimeoutSeconds: z.number().int().min(1).max(300).default(10),
  batchSize: z.number().int().min(1).max(1000).default(10),
});

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
  tasks: z.object({
    lark: syncTaskToggleSchema.default({ enabled: true }),
    meegle: syncTaskToggleSchema.default({ enabled: true }),
    github: syncTaskToggleSchema.default({ enabled: true }),
    shadow: shadowTaskSchema.default({ enabled: false }),
    odooSh: odooShTaskSchema.optional(),
    messageDelivery: messageDeliveryTaskSchema.optional(),
  }).default({
    lark: { enabled: true },
    meegle: { enabled: true },
    github: { enabled: true },
    shadow: { enabled: false },
  }),
}).default({
  enabled: false,
  pollIntervalSeconds: 30,
  concurrency: 2,
  leaseSeconds: 1200,
  intervalsMinutes: { lark: 10, meegle: 15, github: 10 },
  tasks: {
    lark: { enabled: true },
    meegle: { enabled: true },
    github: { enabled: true },
    shadow: { enabled: false },
  },
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

// Server needs only scheduler settings, including deployments without platform targets.
export async function readPlatformSyncSchedulerConfig(path = process.env.PLATFORM_SYNC_CONFIG_PATH || DEFAULT_PLATFORM_SYNC_CONFIG_PATH) {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (path === DEFAULT_PLATFORM_SYNC_CONFIG_PATH && !process.env.PLATFORM_SYNC_CONFIG_PATH
      && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return platformSyncSchedulerSchema.parse({ enabled: false });
    }
    throw error;
  }
  return z.object({ scheduler: platformSyncSchedulerSchema }).parse(JSON.parse(source)).scheduler;
}

export function resolveBackgroundTaskConfig(scheduler: PlatformSyncConfig["scheduler"]) {
  const odooSh = odooShTaskSchema.parse(scheduler.tasks.odooSh ?? {});
  const messageDelivery = messageDeliveryTaskSchema.parse(scheduler.tasks.messageDelivery ?? {});
  return {
    odooSh: { ...odooSh, enabled: scheduler.enabled && odooSh.enabled },
    messageDelivery: { ...messageDelivery, enabled: scheduler.enabled && messageDelivery.enabled },
  };
}


export function parsePlatformSyncConfig(input: unknown): PlatformSyncConfig {
  return platformSyncConfigSchema.parse(input);
}
