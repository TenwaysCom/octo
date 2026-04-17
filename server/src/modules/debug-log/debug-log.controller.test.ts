import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeClientDebugLogController } from "./debug-log.controller.js";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.CLIENT_DEBUG_LOG_FILE;
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("debug-log.controller", () => {
  it("writes popup client logs to a local jsonl file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tw-itdog-debug-log-"));
    tempDirs.push(dir);
    const logFile = join(dir, "popup-client.log");
    process.env.CLIENT_DEBUG_LOG_FILE = logFile;

    await expect(
      writeClientDebugLogController({
        source: "popup:app",
        level: "info",
        event: "acp.send.start",
        detail: {
          activePage: "chat",
          hasOperatorLarkId: true,
        },
      }),
    ).resolves.toEqual({
      ok: true,
    });

    const content = await readFile(logFile, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      source: "popup:app",
      level: "info",
      event: "acp.send.start",
      detail: {
        activePage: "chat",
        hasOperatorLarkId: true,
      },
    });
  });
});
