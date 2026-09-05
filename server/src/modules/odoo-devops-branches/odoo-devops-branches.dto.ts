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
  project_name: z.string().nullable(),
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    branch: z.string(),
    stage: z.string(),
    last_build_status: z.string(),
    last_build_result: z.string(),
    odoo_branch: z.string(),
  })),
});

export type OdooDevopsBranchesSnapshot = z.infer<typeof odooDevopsBranchesSnapshotSchema>;
