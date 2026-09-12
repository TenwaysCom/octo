import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDailyRotatingFileTransport, createFileLogger } from "./logger.js";

const tempDirs: string[] = [];
const datedLogFilePattern = /^app\.\d{4}-\d{2}-\d{2}\.1\.log$/;

async function waitForLogMessage(dir: string, message: string): Promise<string> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const files = await readdir(dir);
    const logFile = files.find((file) => datedLogFilePattern.test(file));

    if (logFile) {
      const contents = await readFile(join(dir, logFile), "utf-8");
      if (contents.includes(message)) {
        return logFile;
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${message} to reach the dated log file`);
}

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

    const logFile = await waitForLogMessage(dir, "DAILY_LOG_TEST");
    await expect(readFile(join(dir, logFile), "utf-8")).resolves.toContain("DAILY_LOG_TEST");
  }, 6_000);
});
