export function success(data, meta) {
    return meta && Object.keys(meta).length > 0 ? { ok: true, data, meta } : { ok: true, data };
}
export function failure(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = /^([A-Z][A-Z0-9_]+)(?:\s|\(|$)/.exec(errorMessage)?.[1] ?? "OCTO_CLI_ERROR";
    return { ok: false, error: { errorCode, errorMessage } };
}
