import pino from "pino";

const logDestination = process.env.LOG_FILE || "./logs/app.log";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
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
    level: (label) => ({ level: label.toUpperCase() }),
  },
  transport: {
    target: "pino/file",
    options: {
      destination: logDestination,
      mkdir: true,
    },
  },
  redact: {
    paths: [
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
    ],
    censor: "[Redacted]",
  },
});
