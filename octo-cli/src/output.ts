export interface OutputMeta {
  profile?: string;
  count?: number;
}

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
  meta?: OutputMeta;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    errorCode: string;
    errorMessage: string;
  };
}

export function success<T>(data: T, meta?: OutputMeta): SuccessEnvelope<T> {
  return meta && Object.keys(meta).length > 0 ? { ok: true, data, meta } : { ok: true, data };
}

export function failure(error: unknown): ErrorEnvelope {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = /^([A-Z][A-Z0-9_]+)(?:\s|\(|$)/.exec(errorMessage)?.[1] ?? "OCTO_CLI_ERROR";
  return { ok: false, error: { errorCode, errorMessage } };
}
