import { resolveApiToken, resolveServerUrl } from "./config.js";
export async function runDoctor(config, options, deps = {}) {
    const checks = [];
    let serverUrl;
    try {
        serverUrl = resolveServerUrl(config, deps.environment);
        checks.push({ name: "serverUrl", ok: true, detail: serverUrl });
    }
    catch (error) {
        checks.push({ name: "serverUrl", ok: false, detail: readError(error) });
    }
    try {
        resolveApiToken(config, deps.environment);
        checks.push({ name: "apiToken", ok: true, detail: "Configured (redacted)." });
    }
    catch (error) {
        checks.push({ name: "apiToken", ok: false, detail: readError(error) });
    }
    if (!options.offline && serverUrl) {
        try {
            const response = await (deps.fetchImpl ?? fetch)(new URL("/health", `${serverUrl}/`), {
                signal: AbortSignal.timeout(5_000),
            });
            checks.push({ name: "health", ok: response.ok, detail: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status}` });
        }
        catch (error) {
            checks.push({ name: "health", ok: false, detail: readError(error) });
        }
    }
    return { ok: checks.every((check) => check.ok), checks };
}
function readError(error) {
    return error instanceof Error ? error.message : String(error);
}
