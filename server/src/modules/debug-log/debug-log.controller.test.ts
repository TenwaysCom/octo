import { createWriteClientDebugLogController } from "./debug-log.controller.js";

describe("debug-log.controller", () => {
  it("writes popup client logs through the configured Pino logger", async () => {
    let infoArgs: unknown[] | undefined;
    const controller = createWriteClientDebugLogController({
      getLogger: () => ({
        debug: () => undefined,
        info: (...args: unknown[]) => {
          infoArgs = args;
        },
        warn: () => undefined,
        error: () => undefined,
      }),
    });

    await expect(
      controller({
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

    expect(infoArgs).toEqual([
      {
        source: "popup:app",
        event: "acp.send.start",
        masterUserId: undefined,
        detail: {
          activePage: "chat",
          hasOperatorLarkId: true,
        },
      },
      "acp.send.start",
    ]);
  });

  it("keeps masterUserId and uses the request log level", async () => {
    let warnArgs: unknown[] | undefined;
    const controller = createWriteClientDebugLogController({
      getLogger: () => ({
        debug: () => undefined,
        info: () => undefined,
        warn: (...args: unknown[]) => {
          warnArgs = args;
        },
        error: () => undefined,
      }),
    });

    await expect(
      controller({
        source: "popup:app",
        level: "warn",
        event: "api.retry",
        masterUserId: "usr_123",
      }),
    ).resolves.toEqual({
      ok: true,
    });

    expect(warnArgs).toEqual([
      {
        source: "popup:app",
        event: "api.retry",
        masterUserId: "usr_123",
        detail: undefined,
      },
      "api.retry",
    ]);
  });
});
