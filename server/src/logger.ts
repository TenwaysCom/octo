import pino from "pino";

const logDestination = process.env.LOG_FILE || "./logs/app.log";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
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
