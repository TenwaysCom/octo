export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  detail?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_BUFFER_SIZE = 5000;

let globalMinLevel: LogLevel =
  import.meta.env.DEV ? "debug" : "info";
const logBuffer: LogEntry[] = [];

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[globalMinLevel];
}

function formatMessage(module: string, message: string): string {
  return `[Tenways Octo][${module}] ${message}`;
}

function pushToBuffer(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

export function setLogLevel(level: LogLevel): void {
  globalMinLevel = level;
}

export function getLogLevel(): LogLevel {
  return globalMinLevel;
}

export function getLogBuffer(): readonly LogEntry[] {
  return logBuffer;
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

export function exportLogsAsBlob(): Blob {
  const json = JSON.stringify(logBuffer, null, 2);
  return new Blob([json], { type: "application/json" });
}

export interface ExtensionLogger {
  debug(message: string, detail?: Record<string, unknown>): void;
  info(message: string, detail?: Record<string, unknown>): void;
  warn(message: string, detail?: Record<string, unknown>): void;
  error(message: string, detail?: Record<string, unknown>): void;
  child(childModule: string): ExtensionLogger;
}

function createLogger(module: string): ExtensionLogger {
  return {
    debug(message: string, detail?: Record<string, unknown>): void {
      if (!shouldLog("debug")) return;
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level: "debug",
        module,
        message,
        detail,
      };
      pushToBuffer(entry);
      console.debug(formatMessage(module, message), detail ?? "");
    },
    info(message: string, detail?: Record<string, unknown>): void {
      if (!shouldLog("info")) return;
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level: "info",
        module,
        message,
        detail,
      };
      pushToBuffer(entry);
      console.info(formatMessage(module, message), detail ?? "");
    },
    warn(message: string, detail?: Record<string, unknown>): void {
      if (!shouldLog("warn")) return;
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level: "warn",
        module,
        message,
        detail,
      };
      pushToBuffer(entry);
      console.warn(formatMessage(module, message), detail ?? "");
    },
    error(message: string, detail?: Record<string, unknown>): void {
      if (!shouldLog("error")) return;
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level: "error",
        module,
        message,
        detail,
      };
      pushToBuffer(entry);
      console.error(formatMessage(module, message), detail ?? "");
    },
    child(childModule: string): ExtensionLogger {
      return createLogger(`${module}:${childModule}`);
    },
  };
}

export const logger = createLogger("core");

export function createExtensionLogger(module: string): ExtensionLogger {
  return createLogger(module);
}
