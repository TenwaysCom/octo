import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../../logger.js";

const configLogger = logger.child({ module: "sla-config" });

export const slaRuleSchema = z.object({
  matchFields: z.array(z.string().min(1)).default(["紧急度", "Priority", "Urgency"]),
  matchValues: z.array(z.string().min(1)),
  targetHours: z.number().positive(),
});

export const slaConfigSchema = z.object({
  defaultTargetHours: z.number().positive().default(168),
  rules: z.array(slaRuleSchema).default([]),
});

export type SlaRule = z.infer<typeof slaRuleSchema>;
export type SlaConfig = z.infer<typeof slaConfigSchema>;

function resolveConfigPath(): string | undefined {
  const envPath = process.env.SLA_RULES_CONFIG_PATH;
  if (envPath) {
    const absolute = resolve(envPath);
    if (existsSync(absolute)) {
      return absolute;
    }
    return undefined;
  }

  const defaultPath = resolve(process.cwd(), "config/sla-rules.json");
  if (existsSync(defaultPath)) {
    return defaultPath;
  }

  return undefined;
}

function buildDefaultConfig(): SlaConfig {
  return {
    defaultTargetHours: 168,
    rules: [
      {
        matchFields: ["紧急度", "Priority", "Urgency"],
        matchValues: ["P0", "紧急"],
        targetHours: 4,
      },
      {
        matchFields: ["紧急度", "Priority", "Urgency"],
        matchValues: ["P1", "高"],
        targetHours: 24,
      },
      {
        matchFields: ["紧急度", "Priority", "Urgency"],
        matchValues: ["P2", "中"],
        targetHours: 72,
      },
    ],
  };
}

let cachedConfig: SlaConfig | null = null;

export function loadSlaConfig(): SlaConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolveConfigPath();
  if (!configPath) {
    configLogger.info("No sla-rules.json found, using default SLA config");
    cachedConfig = buildDefaultConfig();
    return cachedConfig;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = slaConfigSchema.parse(parsed);
    cachedConfig = validated;
    configLogger.info({ path: configPath, ruleCount: validated.rules.length }, "LOAD_SLA_CONFIG OK");
    return cachedConfig;
  } catch (error) {
    configLogger.error({
      path: configPath,
      message: error instanceof Error ? error.message : String(error),
    }, "LOAD_SLA_CONFIG FAIL, falling back to default");
    cachedConfig = buildDefaultConfig();
    return cachedConfig;
  }
}

/**
 * Resolve SLA target hours from field values using configured rules.
 *
 * @param fieldValues - Record of field key -> value (e.g. { "紧急度": "P1", "Priority": "High" })
 * @returns target hours, defaults to config.defaultTargetHours
 */
export function resolveSlaTargetHours(
  fieldValues: Record<string, string | undefined>,
): number {
  const config = loadSlaConfig();

  for (const rule of config.rules) {
    for (const fieldKey of rule.matchFields) {
      const value = fieldValues[fieldKey];
      if (value && rule.matchValues.some((v) => value.includes(v))) {
        return rule.targetHours;
      }
    }
  }

  return config.defaultTargetHours;
}
