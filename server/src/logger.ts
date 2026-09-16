import pino from "pino";

const redactPaths = [
  "*.authCode",
  "*.cookie",
  "*.token",
  "*.refreshToken",
  "*.userToken",
  "*.pluginSecret",
  "*.appSecret",
  "*.password",
  "*.code",
  "body.authCode",
  "body.cookie",
  "body.token",
  "body.refreshToken",
  "query.authCode",
  "query.cookie",
  "query.token",
  "req.body.authCode",
  "req.body.cookie",
  "req.body.token",
  "req.body.refreshToken",
  "responseBody.accessToken",
  "responseBody.refreshToken",
  "responseBody.token",
  "responseBody.data.accessToken",
  "responseBody.data.refreshToken",
  "responseBody.data.token",
];

function createLoggerOptions(level = process.env.LOG_LEVEL || "info") {
  return {
    level,
    timestamp: () => {
      const date = new Date();
      const formatted = date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      });
      return `,"time":"${formatted}"`;
    },
    formatters: {
      level: (label: string) => ({ level: label.toUpperCase() }),
    },
    redact: {
      paths: redactPaths,
      censor: "[Redacted]",
    },
  };
}

export function createDailyRotatingFileTransport(destination: string) {
  return {
    target: "pino-roll",
    options: {
      file: destination,
      frequency: "daily",
      dateFormat: "yyyy-MM-dd",
      mkdir: true,
    },
  };
}

export function createFileLogger(destination: string, level?: string) {
  return pino({
    ...createLoggerOptions(level),
    transport: createDailyRotatingFileTransport(destination),
  });
}

function createStreamLogger(destination: string) {
  const stream = destination === "stdout" ? process.stdout : process.stderr;

  return pino(createLoggerOptions(), stream);
}

export const logger = createFileLogger(process.env.LOG_FILE || "./logs/app.log");
export const apiLogger = createFileLogger(process.env.API_LOG_FILE || "./logs/api.log");
export const stdoutLogger = createStreamLogger("stdout");
