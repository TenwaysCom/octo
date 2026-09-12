import { z } from "zod";

export const incrementalPlatformSyncTargetSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("lark"),
    baseId: z.string().min(1),
    tableId: z.string().min(1),
    larkBaseUrl: z.string().url().optional(),
    titleFieldName: z.string().min(1).optional(),
    statusFieldName: z.string().min(1).optional(),
    sourceUpdatedAtFieldName: z.string().min(1),
  }),
  z.object({
    platform: z.literal("meegle"),
    projectKey: z.string().min(1),
    workItemTypeKey: z.string().min(1),
    sourceUpdatedAtMqlFieldName: z.string().min(1).optional(),
  }),
  z.object({
    platform: z.literal("github"),
    owner: z.string().min(1),
    repo: z.string().min(1),
  }),
]);

export type IncrementalPlatformSyncTarget = z.infer<typeof incrementalPlatformSyncTargetSchema>;

export function platformSyncScopeKey(target: IncrementalPlatformSyncTarget): string {
  if (target.platform === "lark") return `${target.baseId}/${target.tableId}`;
  if (target.platform === "meegle") return `${target.projectKey}/${target.workItemTypeKey}`;
  return `${target.owner}/${target.repo}`;
}
