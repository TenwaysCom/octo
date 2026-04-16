import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../../logger.js";

const configLogger = logger.child({ module: "lark-base-workflow-config" });

// ==================== Zod Schemas ====================

const fieldMappingTransformSchema = z.enum([
  "text",
  "first_line",
  "select_first",
  "array_join",
  "number",
  "select",
]).default("text");

const fieldMappingSchema = z.object({
  larkField: z.string().min(1),
  fallbackLarkFields: z.array(z.string().min(1)).default([]),
  meegleField: z.string().min(1),
  transform: fieldMappingTransformSchema,
  options: z.record(z.string(), z.string()).optional(),
  prefix: z.boolean().default(false).optional(),
});

const issueTypeMappingSchema = z.object({
  larkLabels: z.array(z.string().min(1)),
  workitemTypeKey: z.string().min(1),
  templateId: z.string().min(1),
  urlSlug: z.string().min(1).optional(),
  fieldMappings: z.array(fieldMappingSchema).default([]),
});

const workflowConfigSchema = z.object({
  issueTypeMappings: z.array(issueTypeMappingSchema),
});

// ==================== Types ====================

export type FieldMappingTransform = z.infer<typeof fieldMappingTransformSchema>;
export type FieldMappingConfig = z.infer<typeof fieldMappingSchema>;
export type IssueTypeMappingConfigWithFields = z.infer<typeof issueTypeMappingSchema>;
export type LarkBaseWorkflowConfig = z.infer<typeof workflowConfigSchema>;

// ==================== Config Loader ====================

function resolveConfigPath(): string | undefined {
  const envPath = process.env.LARK_BASE_WORKFLOW_CONFIG_PATH;
  if (envPath) {
    const absolute = resolve(envPath);
    if (existsSync(absolute)) {
      return absolute;
    }
    return undefined;
  }

  const defaultPath = resolve(process.cwd(), "config/lark-base-workflow.json");
  if (existsSync(defaultPath)) {
    return defaultPath;
  }

  return undefined;
}

export function loadLarkBaseWorkflowConfig(): LarkBaseWorkflowConfig | undefined {
  const configPath = resolveConfigPath();
  if (!configPath) {
    return undefined;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = workflowConfigSchema.parse(parsed);
    configLogger.info({ path: configPath, issueTypeCount: validated.issueTypeMappings.length }, "LOAD_CONFIG OK");
    return validated;
  } catch (error) {
    configLogger.error({
      path: configPath,
      message: error instanceof Error ? error.message : String(error),
    }, "LOAD_CONFIG FAIL");
    return undefined;
  }
}

// ==================== Helpers ====================

export function getIssueTypeMappingsFromConfig(
  config: LarkBaseWorkflowConfig,
): IssueTypeMappingConfigWithFields[] {
  return config.issueTypeMappings;
}

export function getFieldMappingsForType(
  workitemTypeKey: string,
  config: LarkBaseWorkflowConfig,
): FieldMappingConfig[] | undefined {
  const mapping = config.issueTypeMappings.find(
    (m) => m.workitemTypeKey === workitemTypeKey,
  );
  if (!mapping || mapping.fieldMappings.length === 0) {
    return undefined;
  }
  return mapping.fieldMappings;
}
