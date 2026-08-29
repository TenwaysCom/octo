import { resolveApiToken, resolveServerUrl, type OctoCliConfig } from "./config.js";

export interface HttpClientDeps {
  fetchImpl?: typeof fetch;
  environment?: NodeJS.ProcessEnv;
}

export class OctoApiClient {
  constructor(private readonly config: OctoCliConfig, private readonly deps: HttpClientDeps = {}) {}

  async get(path: string, query?: Record<string, string>): Promise<unknown> {
    const serverUrl = resolveServerUrl(this.config, this.deps.environment);
    const token = resolveApiToken(this.config, this.deps.environment);
    const url = new URL(path, `${serverUrl}/`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const response = await (this.deps.fetchImpl ?? fetch)(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok || !isSuccessfulPayload(payload)) throw new Error(readApiError(payload, response.status));
    return payload.data;
  }
}

function isSuccessfulPayload(payload: unknown): payload is { ok: true; data: unknown } {
  return Boolean(payload) && typeof payload === "object" && (payload as { ok?: unknown }).ok === true;
}

function readApiError(payload: unknown, status: number): string {
  const error = payload && typeof payload === "object" ? (payload as { error?: unknown }).error : undefined;
  const errorCode = error && typeof error === "object" ? (error as { errorCode?: unknown }).errorCode : undefined;
  return typeof errorCode === "string" && errorCode ? errorCode : `OCTO_API_REQUEST_FAILED (${status})`;
}
