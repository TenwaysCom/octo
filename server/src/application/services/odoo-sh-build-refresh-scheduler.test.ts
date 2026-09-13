import { OdooShBuildRefreshScheduler, ODOO_SH_BUILD_REFRESH_INTERVAL_MS } from "./odoo-sh-build-refresh-scheduler.js";

it("refreshes all three environments on startup and every thirty minutes, and stops cleanly", async () => {
  vi.useFakeTimers();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const scheduler = new OdooShBuildRefreshScheduler({ refresh });
  try {
    scheduler.start();
    scheduler.start();
    await scheduler.runCycle();
    expect(refresh.mock.calls).toEqual([["eu"], ["uk"], ["us"]]);
    expect(ODOO_SH_BUILD_REFRESH_INTERVAL_MS).toBe(1_800_000);
    await vi.advanceTimersByTimeAsync(1_799_999);
    expect(refresh).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(6);
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(1_800_000);
    await scheduler.runCycle();
    expect(refresh).toHaveBeenCalledTimes(6);
  } finally { await scheduler.stop(); vi.useRealTimers(); }
});

it("isolates a failing environment and retries it on the next scheduled cycle", async () => {
  const refresh = vi.fn(async (environment: string) => { if (environment === "uk") throw new Error("timeout"); });
  const scheduler = new OdooShBuildRefreshScheduler({ refresh });
  await scheduler.runCycle();
  expect(refresh.mock.calls).toEqual([["eu"], ["uk"], ["us"]]);
  await scheduler.runCycle();
  expect(refresh).toHaveBeenCalledTimes(6);
  await scheduler.stop();
});

it("coalesces overlapping cycles and drains an active refresh on shutdown", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const refresh = vi.fn().mockReturnValue(pending);
  const scheduler = new OdooShBuildRefreshScheduler({ refresh });
  const first = scheduler.runCycle();
  expect(scheduler.runCycle()).toBe(first);
  expect(refresh).toHaveBeenCalledTimes(3);
  let stopped = false;
  const stopping = scheduler.stop().then(() => { stopped = true; });
  await Promise.resolve();
  expect(stopped).toBe(false);
  release();
  await stopping;
  expect(stopped).toBe(true);
  await scheduler.runCycle();
  expect(refresh).toHaveBeenCalledTimes(3);
});
