export interface KimiAcpSpawnConfig {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface KimiAcpConfigEnv {
  KIMI_ACP_COMMAND?: string;
  KIMI_ACP_ARGS_JSON?: string;
  KIMI_ACP_ENV_JSON?: string;
}

export const ACP_CONFIG_DEFAULTS = {
  command: "kimi",
  args: ["acp"],
  env: {},
} as const;

export function buildKimiAcpSpawnConfig(
  env: KimiAcpConfigEnv & NodeJS.ProcessEnv,
): KimiAcpSpawnConfig {
  const command = env.KIMI_ACP_COMMAND || ACP_CONFIG_DEFAULTS.command;
  const args = parseStringArray(
    env.KIMI_ACP_ARGS_JSON,
    "KIMI_ACP_ARGS_JSON must be a JSON array of strings",
    ACP_CONFIG_DEFAULTS.args,
  );
  const envOverrides = parseStringRecord(
    env.KIMI_ACP_ENV_JSON,
    "KIMI_ACP_ENV_JSON must be a JSON object of string pairs",
    ACP_CONFIG_DEFAULTS.env,
  );

  return {
    command,
    args,
    env: {
      ...process.env,
      ...env,
      ...envOverrides,
    },
  };
}

function parseStringArray(
  raw: string | undefined,
  errorMessage: string,
  fallback: readonly string[],
): string[] {
  if (!raw) {
    return [...fallback];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error(errorMessage);
  }

  return [...parsed];
}

function parseStringRecord(
  raw: string | undefined,
  errorMessage: string,
  fallback: Record<string, string>,
): Record<string, string> {
  if (!raw) {
    return { ...fallback };
  }

  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Object.values(parsed).every((value) => typeof value === "string")
  ) {
    throw new Error(errorMessage);
  }

  return { ...(parsed as Record<string, string>) };
}
