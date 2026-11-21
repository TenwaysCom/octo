import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { LarkAuthenticationError, LarkImageDownloadError } from "../adapters/lark/lark-client.js";
import { ZcodeChatError } from "../adapters/zcode/zcode-chat-client.js";
import type { kcsImageMediaType } from "../domain/kcs-image-evidence.js";
import { openFileLogger } from "../logger.js";

export type ImageOperation = "image" | "inspect-image";
type ImageStage = "scope" | "download" | "input_validation" | "recognition" | "output_validation";
type StageErrorCode = "KCS_IMAGE_SCOPE_INVALID" | "KCS_IMAGE_SCOPE_CHECK_FAILED"
  | "KCS_IMAGE_DOWNLOAD_FAILED" | "KCS_IMAGE_INPUT_INVALID" | "KCS_VISION_MODEL_INVALID"
  | "KCS_IMAGE_RECOGNITION_FAILED" | "KCS_IMAGE_BYTES_INVALID" | "KCS_IMAGE_OUTPUT_INVALID";

export class KcsImageError extends Error {
  constructor(readonly code: StageErrorCode) {
    super(code);
  }
}

export const imageLogId = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const imageLogScope = z.object({ baseId: imageLogId, tableId: imageLogId, recordId: imageLogId, messageId: imageLogId });
const imageLogContext = imageLogScope.extend({
  actionRunId: z.uuid({ version: "v4" }),
  ticketNo: imageLogId,
  messageIndex: z.int().positive(),
  imageIndex: z.int().positive(),
}).strict();
type ImageLogContext = z.infer<typeof imageLogContext>;

interface ImageLogDetails {
  ticketNo?: string;
  messageIndex?: number;
  imageIndex?: number;
  bytes?: number;
  mediaType?: z.infer<typeof kcsImageMediaType>;
  sha256?: string;
  requestedModel?: string;
  responseModel?: string;
  httpStatus?: number;
  providerErrorCode?: number;
  responseHeadersMs?: number;
  providerDurationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

function readImageLogContext(value?: string): ImageLogContext | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    return imageLogContext.safeParse(JSON.parse(value)).data;
  } catch {
    return undefined;
  }
}

function resolveImageLogContext(operation: ImageOperation, args: string[], value?: string): Partial<ImageLogContext> & { actionRunId: string } {
  const context = readImageLogContext(value);
  if (operation === "inspect-image") return context ?? { actionRunId: randomUUID() };
  const [baseId, tableId, recordId, messageId] = args;
  const scope = imageLogScope.safeParse({ baseId, tableId, recordId, messageId }).data;
  if (scope && context && scope.baseId === context.baseId && scope.tableId === context.tableId
      && scope.recordId === context.recordId && scope.messageId === context.messageId) {
    return context;
  }
  return { ...scope, actionRunId: randomUUID() };
}

function imageFailure(error: unknown, fallback: StageErrorCode) {
  if (error instanceof KcsImageError) return { errorCode: error.code };
  if (error instanceof LarkImageDownloadError) {
    return { errorCode: error.code, httpStatus: error.httpStatus, providerErrorCode: error.providerErrorCode };
  }
  if (error instanceof LarkAuthenticationError) return { errorCode: "LARK_IMAGE_AUTH_REQUIRED" };
  if (error instanceof ZcodeChatError) {
    const providerErrorCode = error.providerErrorCode && /^\d{1,8}$/.test(error.providerErrorCode)
      ? Number(error.providerErrorCode) : undefined;
    const errorCode = providerErrorCode === 1302 ? "ZCODE_ACCOUNT_RATE_LIMITED"
      : providerErrorCode === 1305 ? "ZCODE_SERVICE_OVERLOADED" : error.code;
    return { errorCode, httpStatus: error.statusCode, providerErrorCode };
  }
  return { errorCode: fallback };
}

type ImageLogger = { info(event: object): void; warn(event: object): void };

export function createImageTrace(operation: ImageOperation, args: string[], value?: string, logger?: ImageLogger) {
  const context = resolveImageLogContext(operation, args, value);
  const details: ImageLogDetails = {};
  return {
    actionRunId: context.actionRunId,
    position: { messageIndex: context.messageIndex, imageIndex: context.imageIndex },
    addDetails(fields: ImageLogDetails) {
      Object.assign(details, fields);
    },
    async stage<T>(stage: ImageStage, fallback: StageErrorCode, action: () => T | Promise<T>): Promise<T> {
      const base = { ...context, layer: "server", module: "ticket-kcs", operation, stage: `server.kcs-image.${stage}` };
      const startedAt = performance.now();
      logger?.info({ ...base, ...details, phase: "start" });
      try {
        const result = await action();
        logger?.info({ ...base, ...details, phase: "completed", durationMs: Math.round(performance.now() - startedAt) });
        return result;
      } catch (error) {
        logger?.warn({
          ...base, ...details, ...imageFailure(error, fallback),
          phase: "failed", durationMs: Math.round(performance.now() - startedAt),
        });
        throw error;
      }
    },
  };
}

export type ImageTrace = ReturnType<typeof createImageTrace>;

export function imageLogMetadata(bytes: Buffer, mediaType?: z.infer<typeof kcsImageMediaType>) {
  return { bytes: bytes.length, mediaType, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function createKcsImageLogger(directory: string, writeError: (line: string) => void) {
  let failed = false;
  const reportFailure = () => {
    if (failed) return;
    failed = true;
    writeError("KCS_IMAGE_LOG_WRITE_FAILED\n");
  };
  let file: ReturnType<typeof openFileLogger> | undefined;
  try {
    file = openFileLogger(join(directory, "kcs-images.log"), "info", reportFailure);
  } catch {
    reportFailure();
  }
  const write = (level: "info" | "warn", event: object) => {
    if (failed || !file) return;
    try {
      file.logger[level](event);
    } catch {
      reportFailure();
    }
  };
  const logger: ImageLogger = { info: (event) => write("info", event), warn: (event) => write("warn", event) };
  return { logger, close: () => file?.close() };
}
