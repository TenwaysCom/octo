import { z } from "zod";

export const odooDevopsEnvironmentSchema = z.enum(["eu", "uk", "us"]);

export const odooDevopsBranchesQuerySchema = z.object({
  environment: odooDevopsEnvironmentSchema,
});

export const odooDevopsBranchesCacheResetBodySchema = z.object({
  actionRunId: z.string().trim().min(1).max(100),
});

export const odooDevopsBranchesSnapshotSchema = z.object({
  environment: odooDevopsEnvironmentSchema,
  project_id: z.number().int(),
  project_name: z.string().nullable(),
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    // 上游在分支从未构建时会把 database_id 回退为分支 id（不可靠 build 身份）；
    // 消费方须配合 last_build_status/last_build_result 判定是否存在真实 build。
    database_id: z.number().int().nullable(),
    branch: z.string(),
    stage: z.string(),
    last_build_status: z.string(),
    last_build_result: z.string(),
    odoo_branch: z.string(),
    connect_url: z.string().nullable(),
  })),
});

export type OdooDevopsBranchesSnapshot = z.infer<typeof odooDevopsBranchesSnapshotSchema>;

export const odooDevopsBranchesRefreshingSchema = z.object({
  state: z.literal("refreshing"),
  environment: odooDevopsEnvironmentSchema,
  retryAfterMs: z.number().int().positive(),
});

export type OdooDevopsBranchesRefreshing = z.infer<typeof odooDevopsBranchesRefreshingSchema>;

/** /builds 的真实契约；保留上游数组顺序，不支持 limit。 */
export const odooDevopsBuildsSnapshotSchema = z.object({
  environment: odooDevopsEnvironmentSchema,
  project_id: z.number().int().positive(),
  project_name: z.string().nullable(),
  cached: z.literal(false),
  items: z.array(z.object({
    branch_info: z.object({ name: z.string().min(1), stage: z.string() }),
    builds: z.array(z.object({
      id: z.number().int().positive(),
      status: z.string(),
      result: z.string(),
      stage: z.string(),
      odoo_branch: z.string(),
      url: z.string().nullable(),
      head_commit_author: z.string().nullable(),
      head_commit_url: z.string().nullable(),
    })),
  })),
});
export type OdooDevopsBuildsSnapshot = z.infer<typeof odooDevopsBuildsSnapshotSchema>;
