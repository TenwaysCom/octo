import { resolveApiToken, resolveServerUrl, type OctoCliConfig } from "./config.js";

export interface DoctorCheck {
  name: "serverUrl" | "apiToken" | "health";
  ok: boolean;
  detail: string;
}

export interface DoctorDeps {
  fetchImpl?: typeof fetch;
  environment?: NodeJS.ProcessEnv;
}

export async function runDoctor(
  config: OctoCliConfig,
  options: { offline: boolean },
  deps: DoctorDeps = {},
): Promise<{ ok: boolean; checks: DoctorCheck[] }> {
  const checks: DoctorCheck[] = [];
  let serverUrl: string | undefined;
  try {
    serverUrl = resolveServerUrl(config, deps.environment);
    checks.push({ name: "serverUrl", ok: true, detail: serverUrl });
  } catch (error) {
    checks.push({ name: "serverUrl", ok: false, detail: readError(error) });
  }
  try {
    resolveApiToken(config, deps.environment);
    checks.push({ name: "apiToken", ok: true, detail: "Configured (redacted)." });
  } catch (error) {
    checks.push({ name: "apiToken", ok: false, detail: readError(error) });
  }

  if (!options.offline && serverUrl) {
    try {
      const response = await (deps.fetchImpl ?? fetch)(new URL("/health", `${serverUrl}/`), {
        signal: AbortSignal.timeout(5_000),
      });
      checks.push({ name: "health", ok: response.ok, detail: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status}` });
    } catch (error) {
      checks.push({ name: "health", ok: false, detail: readError(error) });
    }
  }

  return { ok: checks.every((check) => check.ok), checks };
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
