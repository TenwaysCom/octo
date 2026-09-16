export type ActionErrorLayer = "server" | "adapter" | "platform";

export interface ActionErrorEnvelope {
  layer: ActionErrorLayer;
  module: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  actionRunId?: string;
  rawStatusCode?: number;
  rawResponseSummary?: string;
}

export interface CreateActionErrorEnvelopeInput {
  layer?: ActionErrorLayer;
  module: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  actionRunId?: string;
  rawStatusCode?: number;
  rawResponseSummary?: string;
}

export function getActionRunId(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const value = (input as Record<string, unknown>).actionRunId;
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export function summarizeRawResponse(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.slice(0, 500);
  }

  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

export function getErrorResponseSummary(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return summarizeRawResponse((error as { response?: unknown }).response);
}

export function createActionErrorEnvelope(
  input: CreateActionErrorEnvelopeInput,
): ActionErrorEnvelope {
  return {
    layer: input.layer ?? "server",
    module: input.module,
    stage: input.stage,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    ...(input.actionRunId ? { actionRunId: input.actionRunId } : {}),
    ...(input.rawStatusCode !== undefined ? { rawStatusCode: input.rawStatusCode } : {}),
    ...(input.rawResponseSummary ? { rawResponseSummary: input.rawResponseSummary } : {}),
  };
}

export function createActionErrorEnvelopeFromError(
  error: unknown,
  input: Omit<CreateActionErrorEnvelopeInput, "errorMessage" | "rawStatusCode" | "rawResponseSummary"> & {
    errorMessage?: string;
  },
): ActionErrorEnvelope {
  return createActionErrorEnvelope({
    ...input,
    errorMessage: input.errorMessage ?? (error instanceof Error ? error.message : String(error)),
    rawStatusCode: getErrorStatusCode(error),
    rawResponseSummary: getErrorResponseSummary(error),
  });
}
