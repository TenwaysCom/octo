import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface OctoCliConfig {
  serverUrl?: string;
  apiToken?: string;
}

interface OctoCliConfigFile {
  activeProfile?: string;
  profiles?: Record<string, OctoCliConfig>;
}

export interface OctoCliProfileSummary {
  name: string;
  active: boolean;
  config: Record<string, string | undefined>;
}

export const DEFAULT_PROFILE = "default";

export function getConfigPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configHome = environment.OCTO_CLI_HOME?.trim();
  return join(configHome || join(homedir(), ".octo-cli"), "config.json");
}

export async function loadConfig(
  configPath = getConfigPath(),
  profile = DEFAULT_PROFILE,
): Promise<OctoCliConfig> {
  const configFile = await loadConfigFile(configPath);
  return configFile.profiles?.[normalizeProfileName(profile)] ?? {};
}

export async function listProfiles(configPath = getConfigPath()): Promise<OctoCliProfileSummary[]> {
  const configFile = await loadConfigFile(configPath);
  const activeProfile = configFile.activeProfile ?? DEFAULT_PROFILE;
  return Object.entries(configFile.profiles ?? {}).map(([name, config]) => ({
    name,
    active: name === activeProfile,
    config: redactConfig(config),
  }));
}

export async function getActiveProfile(configPath = getConfigPath()): Promise<string> {
  return (await loadConfigFile(configPath)).activeProfile ?? DEFAULT_PROFILE;
}

export async function setActiveProfile(profile: string, configPath = getConfigPath()): Promise<void> {
  const normalizedProfile = normalizeProfileName(profile);
  const configFile = await loadConfigFile(configPath);
  if (!configFile.profiles?.[normalizedProfile]) {
    throw new Error(`Profile \"${normalizedProfile}\" does not exist.`);
  }
  await saveConfigFile({ ...configFile, activeProfile: normalizedProfile }, configPath);
}

export async function removeProfile(profile: string, configPath = getConfigPath()): Promise<void> {
  const normalizedProfile = normalizeProfileName(profile);
  const configFile = await loadConfigFile(configPath);
  if (normalizedProfile === configFile.activeProfile) {
    throw new Error("Switch profiles before removing the active profile.");
  }
  const { [normalizedProfile]: _removed, ...profiles } = configFile.profiles ?? {};
  await saveConfigFile({ ...configFile, profiles }, configPath);
}

export async function loadConfigFile(configPath = getConfigPath()): Promise<Required<OctoCliConfigFile>> {
  try {
    const raw = await readFile(configPath, "utf8");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Config must be a JSON object.");
    return parseConfigFile(value as Record<string, unknown>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { activeProfile: DEFAULT_PROFILE, profiles: {} };
    }
    throw new Error(`Unable to read Octo client config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveConfig(
  config: OctoCliConfig,
  configPath = getConfigPath(),
  profile = DEFAULT_PROFILE,
): Promise<void> {
  const configFile = await loadConfigFile(configPath);
  const normalizedProfile = normalizeProfileName(profile);
  await saveConfigFile({
    ...configFile,
    activeProfile: configFile.activeProfile || normalizedProfile,
    profiles: { ...configFile.profiles, [normalizedProfile]: sanitizeConfig(config) },
  }, configPath);
}

async function saveConfigFile(configFile: OctoCliConfigFile, configPath: string): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(configFile, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function parseConfigFile(value: Record<string, unknown>): Required<OctoCliConfigFile> {
  const profiles = value.profiles;
  if (profiles && typeof profiles === "object" && !Array.isArray(profiles)) {
    const parsedProfiles = Object.fromEntries(
      Object.entries(profiles).map(([name, config]) => [normalizeProfileName(name), sanitizeConfig(config)]),
    );
    return {
      activeProfile: typeof value.activeProfile === "string" ? normalizeProfileName(value.activeProfile) : DEFAULT_PROFILE,
      profiles: parsedProfiles,
    };
  }

  return {
    activeProfile: DEFAULT_PROFILE,
    profiles: { [DEFAULT_PROFILE]: sanitizeConfig(value) },
  };
}

function sanitizeConfig(value: unknown): OctoCliConfig {
  const config = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    serverUrl: typeof config.serverUrl === "string" ? config.serverUrl : undefined,
    apiToken: typeof config.apiToken === "string" ? config.apiToken : undefined,
  };
}

export function normalizeProfileName(value: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error("Profile names must be 1-64 characters using letters, numbers, '.', '_' or '-'.");
  }
  return normalized;
}

export function resolveServerUrl(config: OctoCliConfig, environment: NodeJS.ProcessEnv = process.env): string {
  const serverUrl = environment.OCTO_SERVER_URL?.trim() || config.serverUrl?.trim();
  if (!serverUrl) throw new Error("Octo server URL is not configured. Run: octo-cli config set --server-url <url>");
  return serverUrl.replace(/\/$/, "");
}

export function resolveApiToken(config: OctoCliConfig, environment: NodeJS.ProcessEnv = process.env): string {
  const apiToken = environment.OCTO_API_TOKEN?.trim() || config.apiToken?.trim();
  if (!apiToken) throw new Error("Octo API token is not configured. Run: octo-cli config set --api-token <token>");
  return apiToken;
}

export function redactConfig(config: OctoCliConfig): Record<string, string | undefined> {
  return { serverUrl: config.serverUrl, apiToken: config.apiToken ? "********" : undefined };
}
