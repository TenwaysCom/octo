import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";

const apiLogger = logger.child({ module: "api-request" });

type LogLevel = "log" | "warn" | "error";
type LogPhase = "START" | "OK" | "WARN" | "FAIL";

function toAuthCodeSuffix(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length < 4) {
    return undefined;
  }

  return value.slice(-4);
}

export function summarizeRequestPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const authCode = typeof record.authCode === "string"
    ? record.authCode
    : typeof record.code === "string"
      ? record.code
      : undefined;

  return {
    requestId: record.requestId,
    masterUserId: record.masterUserId,
    operatorLarkId: record.operatorLarkId,
    meegleUserKey: record.meegleUserKey,
    baseUrl: record.baseUrl,
    state: record.state,
    hasAuthCode: Boolean(authCode),
    authCodeSuffix: toAuthCodeSuffix(authCode),
    hasCookie: typeof record.cookie === "string" && record.cookie.length > 0,
  };
}

export function logApiRequest(
  phase: LogPhase,
  detail: Record<string, unknown>,
  level: LogLevel = "log",
): void {
  const logFn = level === "error"
    ? apiLogger.error.bind(apiLogger)
    : level === "warn"
      ? apiLogger.warn.bind(apiLogger)
      : apiLogger.info.bind(apiLogger);

  logFn({ phase, ...detail }, "API_REQUEST");
}

export function createApiRequestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const detail = {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      query: summarizeRequestPayload(req.query),
      body: summarizeRequestPayload(req.body),
    };

    logApiRequest("START", detail);

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const responseDetail = {
        ...detail,
        statusCode: res.statusCode,
        durationMs,
      };

      if (res.statusCode >= 500) {
        logApiRequest("FAIL", responseDetail, "error");
        return;
      }

      if (res.statusCode >= 400) {
        logApiRequest("WARN", responseDetail, "warn");
        return;
      }

      logApiRequest("OK", responseDetail);
    });

    next();
  };
}
