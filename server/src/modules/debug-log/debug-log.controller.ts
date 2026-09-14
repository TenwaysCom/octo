import type { Logger } from "pino";
import { resolve } from "node:path";
import { z } from "zod";
import { createFileLogger } from "../../logger.js";

const clientDebugLogRequestSchema = z.object({
  source: z.string().min(1),
  level: z.enum(["debug", "info", "warn", "error"]),
  event: z.string().min(1),
  masterUserId: z.string().min(1).optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

type ClientDebugLogger = Pick<Logger, "debug" | "info" | "warn" | "error">;

type DebugLogControllerDeps = {
  getLogger: (destination: string) => ClientDebugLogger;
};

const popupLoggers = new Map<string, ClientDebugLogger>();

function getPopupClientLogger(destination: string): ClientDebugLogger {
  const existing = popupLoggers.get(destination);
  if (existing) {
    return existing;
  }

  const logger = createFileLogger(
    destination,
    process.env.CLIENT_DEBUG_LOG_LEVEL || "debug",
  );
  popupLoggers.set(destination, logger);
  return logger;
}

export function createWriteClientDebugLogController(
  deps: DebugLogControllerDeps = { getLogger: getPopupClientLogger },
) {
  return async function writeClientDebugLogController(input: unknown) {
    const payload = clientDebugLogRequestSchema.parse(input);
    const logFile = resolve(process.env.CLIENT_DEBUG_LOG_FILE || "./logs/popup-client.log");
    const logger = deps.getLogger(logFile);

    logger[payload.level](
      {
        source: payload.source,
        event: payload.event,
        masterUserId: payload.masterUserId,
        detail: payload.detail,
      },
      payload.event,
    );

    return {
      ok: true,
    };
  };
}

export const writeClientDebugLogController = createWriteClientDebugLogController();
