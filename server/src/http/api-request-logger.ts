import type { NextFunction, Request, Response } from "express";
import { apiLogger } from "../logger.js";

const requestLogger = apiLogger.child({ module: "api-request" });

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
    ? requestLogger.error.bind(requestLogger)
    : level === "warn"
      ? requestLogger.warn.bind(requestLogger)
      : requestLogger.info.bind(requestLogger);

  logFn({ phase, ...detail }, "API_REQUEST");
}

function getHeaderMasterUserId(req: Request): string | undefined {
  const headerValue = req.headers["master-user-id"];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function summarizeResponseData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (typeof record.status === "string") {
    summary.status = record.status;
  }
  if (typeof record.reason === "string") {
    summary.reason = record.reason;
  }
  if (typeof record.masterUserId === "string") {
    summary.masterUserId = record.masterUserId;
  }
  if (typeof record.operatorLarkId === "string") {
    summary.operatorLarkId = record.operatorLarkId;
  }
  if (typeof record.sessionId === "string") {
    summary.sessionId = record.sessionId;
  }
  if (typeof record.baseUrl === "string") {
    summary.baseUrl = record.baseUrl;
  }
  if (typeof record.expiresAt === "string") {
    summary.expiresAt = record.expiresAt;
  }
  if (typeof record.tokenType === "string") {
    summary.tokenType = record.tokenType;
  }
  if ("accessToken" in record) {
    summary.hasAccessToken = typeof record.accessToken === "string" && record.accessToken.length > 0;
  }
  if ("refreshToken" in record) {
    summary.hasRefreshToken = typeof record.refreshToken === "string" && record.refreshToken.length > 0;
  }
  if (Array.isArray(record.sessions)) {
    summary.sessionsCount = record.sessions.length;
  }

  return Object.keys(summary).length > 0
    ? summary
    : {
      keys: Object.keys(record),
    };
}

export function summarizeResponsePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (typeof record.ok === "boolean") {
    summary.ok = record.ok;
  }
  if (typeof record.status === "string") {
    summary.status = record.status;
  }
  if (typeof record.service === "string") {
    summary.service = record.service;
  }
  if ("data" in record) {
    summary.data = summarizeResponseData(record.data);
  }
  if ("error" in record && record.error && typeof record.error === "object" && !Array.isArray(record.error)) {
    const error = record.error as Record<string, unknown>;
    summary.error = {
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
    };
  }

  return Object.keys(summary).length > 0
    ? summary
    : {
      keys: Object.keys(record),
    };
}

export function createApiRequestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = ((body: unknown) => {
      responseBody = summarizeResponsePayload(body);
      return originalJson(body);
    }) as Response["json"];

    res.send = ((body: unknown) => {
      if (responseBody === undefined) {
        responseBody = summarizeResponsePayload(body);
      }
      return originalSend(body);
    }) as Response["send"];

    const detail = {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      headerMasterUserId: getHeaderMasterUserId(req),
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
        responseBody,
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
