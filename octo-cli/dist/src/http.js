import { resolveApiToken, resolveServerUrl } from "./config.js";
export class OctoApiClient {
    config;
    deps;
    constructor(config, deps = {}) {
        this.config = config;
        this.deps = deps;
    }
    async get(path, query) {
        const serverUrl = resolveServerUrl(this.config, this.deps.environment);
        const token = resolveApiToken(this.config, this.deps.environment);
        const url = new URL(path, `${serverUrl}/`);
        for (const [key, value] of Object.entries(query ?? {}))
            url.searchParams.set(key, value);
        const response = await (this.deps.fetchImpl ?? fetch)(url, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => undefined);
        if (!response.ok || !isSuccessfulPayload(payload))
            throw new Error(readApiError(payload, response.status));
        return payload.data;
    }
}
function isSuccessfulPayload(payload) {
    return Boolean(payload) && typeof payload === "object" && payload.ok === true;
}
function readApiError(payload, status) {
    const error = payload && typeof payload === "object" ? payload.error : undefined;
    const errorCode = error && typeof error === "object" ? error.errorCode : undefined;
    return typeof errorCode === "string" && errorCode ? errorCode : `OCTO_API_REQUEST_FAILED (${status})`;
}
