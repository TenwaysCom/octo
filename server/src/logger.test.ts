import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDailyRotatingFileTransport, createFileLogger } from "./logger.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("createDailyRotatingFileTransport", () => {
  it("configures Pino to create one log file per local date", () => {
    expect(createDailyRotatingFileTransport("./logs/app.log")).toEqual({
      target: "pino-roll",
      options: {
        file: "./logs/app.log",
        frequency: "daily",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
      },
    });
  });

  it("writes through Pino to the dated log filename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "octo-logger-"));
    tempDirs.push(dir);
    const logger = createFileLogger(join(dir, "app.log"));

    logger.info({ operation: "logger.test" }, "DAILY_LOG_TEST");
    await new Promise<void>((resolve, reject) => {
      logger.flush((error) => (error ? reject(error) : resolve()));
    });

    const files = await readdir(dir);
    const logFile = files.find((file) => /^app\.\d{4}-\d{2}-\d{2}\.1\.log$/.test(file));
    expect(logFile).toBeDefined();
    await expect(readFile(join(dir, logFile ?? ""), "utf-8")).resolves.toContain("DAILY_LOG_TEST");
  });
});
