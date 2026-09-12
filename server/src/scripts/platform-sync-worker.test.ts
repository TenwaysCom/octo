import {
  isPlatformSyncWorkerEntrypoint,
  waitUntilAborted,
} from "./platform-sync-worker.js";

describe("platform sync Worker entrypoint", () => {
  it("recognizes both direct Node and PM2 fork-mode executable paths", () => {
    const moduleUrl = "file:///srv/octo/server/dist/scripts/platform-sync-worker.js";

    expect(isPlatformSyncWorkerEntrypoint(
      moduleUrl,
      "/srv/octo/server/dist/scripts/platform-sync-worker.js",
      undefined,
    )).toBe(true);
    expect(isPlatformSyncWorkerEntrypoint(
      moduleUrl,
      "/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js",
      "/srv/octo/server/dist/scripts/platform-sync-worker.js",
    )).toBe(true);
    expect(isPlatformSyncWorkerEntrypoint(
      moduleUrl,
      "/srv/octo/server/dist/index.js",
      undefined,
    )).toBe(false);
  });

  it("keeps a disabled Worker alive until it receives a shutdown signal", async () => {
    const abortController = new AbortController();
    const keepAliveTimer = setInterval(() => undefined, 60_000);
    const unref = vi.spyOn(keepAliveTimer, "unref");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue(keepAliveTimer);

    const waiting = waitUntilAborted(abortController.signal);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(unref).not.toHaveBeenCalled();
    abortController.abort();
    await expect(waiting).resolves.toBeUndefined();
    setIntervalSpy.mockRestore();
  });
});
