import { parsePlatformSyncConfig } from "../../scripts/platform-sync.js";
import { PlatformSyncCoordinatorError } from "./platform-sync-coordinator.js";
import {
  buildPlatformSyncScheduleDefinitions,
  isRetryablePlatformSyncError,
  platformSyncErrorCode,
  PlatformSyncWorker,
} from "./platform-sync-worker.js";

const workerLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../logger.js", () => ({
  logger: { child: () => workerLog },
}));

describe("PlatformSyncWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds one incremental schedule per configured platform scope", () => {
    const config = parsePlatformSyncConfig({
      scheduler: { enabled: true },
      larkBase: [{ baseId: "base", tableId: "table" }],
      meegle: [{
        projectKey: "project",
        workItemTypeKeys: ["story", "task"],
        sourceUpdatedAtMqlFieldNames: { story: "updated_at", task: "updated_at" },
      }],
      github: [{ owner: "acme", repo: "app" }],
    });

    expect(buildPlatformSyncScheduleDefinitions(config, "user-1").map((entry) => entry.scheduleId)).toEqual([
      "lark:base/table",
      "meegle:project/story",
      "meegle:project/task",
      "github:acme/app",
    ]);
    expect(() => buildPlatformSyncScheduleDefinitions(config, undefined)).toThrow("PLATFORM_SYNC_MASTER_USER_ID");
  });

  it("defaults every task toggle on except the shadow task", () => {
    const config = parsePlatformSyncConfig({
      scheduler: { enabled: true },
      github: [{ owner: "acme", repo: "app" }],
    });

    expect(config.scheduler.tasks.lark.enabled).toBe(true);
    expect(config.scheduler.tasks.meegle.enabled).toBe(true);
    expect(config.scheduler.tasks.github.enabled).toBe(true);
    expect(config.scheduler.tasks.shadow.enabled).toBe(false);
  });

  it("accepts DeepSeek timeout configuration for the shadow task and preserves the legacy alias", () => {
    const current = parsePlatformSyncConfig({
      scheduler: { tasks: { shadow: { enabled: true, deepSeekTimeoutSeconds: 90 } } },
      github: [{ owner: "acme", repo: "app" }],
    });
    const legacy = parsePlatformSyncConfig({
      scheduler: { tasks: { shadow: { enabled: true, acpTimeoutSeconds: 300 } } },
      github: [{ owner: "acme", repo: "app" }],
    });

    expect(current.scheduler.tasks.shadow.deepSeekTimeoutSeconds).toBe(90);
    expect(legacy.scheduler.tasks.shadow.acpTimeoutSeconds).toBe(300);
  });

  it("omits schedules for tasks disabled under scheduler.tasks and honors per-task intervals", () => {
    const config = parsePlatformSyncConfig({
      scheduler: {
        enabled: true,
        intervalsMinutes: { lark: 10, meegle: 15, github: 10 },
        tasks: {
          lark: { enabled: false },
          meegle: { enabled: true, intervalMinutes: 45 },
          github: { enabled: true },
        },
      },
      larkBase: [{ baseId: "base", tableId: "table" }],
      meegle: [{
        projectKey: "project",
        workItemTypeKeys: ["story"],
        sourceUpdatedAtMqlFieldNames: { story: "updated_at" },
      }],
      github: [{ owner: "acme", repo: "app" }],
    });

    const definitions = buildPlatformSyncScheduleDefinitions(config, "user-1");
    expect(definitions.map((entry) => entry.scheduleId)).toEqual([
      "meegle:project/story",
      "github:acme/app",
    ]);
    expect(definitions[0]!.intervalSeconds).toBe(45 * 60);
    expect(definitions[1]!.intervalSeconds).toBe(10 * 60);
  });

  it("does not require a master user when the Lark and Meegle tasks are disabled", () => {
    const config = parsePlatformSyncConfig({
      scheduler: {
        enabled: true,
        tasks: {
          lark: { enabled: false },
          meegle: { enabled: false },
          github: { enabled: true },
        },
      },
      larkBase: [{ baseId: "base", tableId: "table" }],
      github: [{ owner: "acme", repo: "app" }],
    });

    expect(buildPlatformSyncScheduleDefinitions(config, undefined).map((entry) => entry.scheduleId)).toEqual([
      "github:acme/app",
    ]);
  });

  it("runs a claimed schedule and records success", async () => {
    const schedule = githubSchedule();
    const scheduleStore = {
      reconcileConfigSchedules: vi.fn(),
      claimDue: vi.fn().mockResolvedValue([schedule]),
      markSuccess: vi.fn().mockResolvedValue(undefined),
      markCoalesced: vi.fn().mockResolvedValue(undefined),
      markTransientFailure: vi.fn(),
      markBlocked: vi.fn(),
    };
    const coordinator = {
      runIncremental: vi.fn().mockImplementation(async (input) => ({
        ...await input.execute({ watermarkUpdatedAt: "2026-08-26T00:00:00.000Z", watermarkTiebreaker: "1" }, {
          actionRunId: input.actionRunId,
          runId: "run-1",
        }),
        runId: "run-1",
        actionRunId: input.actionRunId,
      })),
    };
    const service = {
      incrementalSyncGitHubPullRequests: vi.fn().mockResolvedValue(syncResult()),
      incrementalSyncLarkBaseTickets: vi.fn(),
      incrementalSyncMeegleWorkitems: vi.fn(),
    };
    const worker = new PlatformSyncWorker({
      scheduleStore,
      coordinator,
      service,
      concurrency: 2,
      pollIntervalMs: 30_000,
    });

    await expect(worker.runOnce("2026-08-26T00:00:00.000Z")).resolves.toEqual([
      expect.objectContaining({ status: "succeeded", scheduleId: schedule.scheduleId }),
    ]);
    expect(service.incrementalSyncGitHubPullRequests).toHaveBeenCalledWith(expect.objectContaining({
      owner: "acme",
      repo: "app",
      cleanAfterSync: true,
    }));
    expect(scheduleStore.markSuccess).toHaveBeenCalledWith(schedule.scheduleId);
    const startedLog = workerLog.info.mock.calls.find(([, event]) => event === "PLATFORM_SYNC_SCHEDULE_STARTED");
    const finishedLog = workerLog.info.mock.calls.find(([, event]) => event === "PLATFORM_SYNC_SCHEDULE_FINISHED");
    expect(startedLog?.[0]).toEqual(expect.objectContaining({
      stage: "server.sync.schedule_started",
      scheduleId: schedule.scheduleId,
      platform: "github",
      scopeKey: "acme/app",
      trigger: "scheduled",
      attempt: 1,
      actionRunId: expect.any(String),
    }));
    expect(finishedLog?.[0]).toEqual(expect.objectContaining({
      stage: "server.sync.schedule_finished",
      scheduleId: schedule.scheduleId,
      status: "succeeded",
      durationMs: expect.any(Number),
      actionRunId: startedLog?.[0].actionRunId,
    }));
  });

  it("retries transient failures and blocks permanent checkpoint failures", async () => {
    expect(isRetryablePlatformSyncError(new Error("fetch failed with 503"))).toBe(true);
    expect(isRetryablePlatformSyncError(new PlatformSyncCoordinatorError(
      "SYNC_CHECKPOINT_REQUIRED",
      "checkpoint required",
    ))).toBe(false);
    expect(platformSyncErrorCode(new PlatformSyncCoordinatorError(
      "SYNC_FAILED",
      "LARK_AUTH_REQUIRED",
      { cause: new Error("LARK_AUTH_REQUIRED") },
    ))).toBe("LARK_AUTH_REQUIRED");
    const schedule = githubSchedule();
    const scheduleStore = {
      reconcileConfigSchedules: vi.fn(),
      claimDue: vi.fn()
        .mockResolvedValueOnce([schedule])
        .mockResolvedValueOnce([schedule])
        .mockResolvedValueOnce([schedule]),
      markSuccess: vi.fn(),
      markCoalesced: vi.fn().mockResolvedValue(undefined),
      markTransientFailure: vi.fn().mockResolvedValue("retry_scheduled"),
      markBlocked: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      runIncremental: vi.fn()
        .mockRejectedValueOnce(new Error("fetch failed with 503"))
        .mockRejectedValueOnce(new PlatformSyncCoordinatorError("SYNC_CHECKPOINT_REQUIRED", "checkpoint required"))
        .mockRejectedValueOnce(new PlatformSyncCoordinatorError("SYNC_ALREADY_RUNNING", "already running")),
    };
    const worker = new PlatformSyncWorker({
      scheduleStore,
      coordinator,
      service: {
        incrementalSyncGitHubPullRequests: vi.fn(),
        incrementalSyncLarkBaseTickets: vi.fn(),
        incrementalSyncMeegleWorkitems: vi.fn(),
      },
      concurrency: 1,
      pollIntervalMs: 30_000,
    });

    await expect(worker.runOnce()).resolves.toEqual([
      expect.objectContaining({ status: "retry_scheduled" }),
    ]);
    await expect(worker.runOnce()).resolves.toEqual([
      expect.objectContaining({ status: "blocked", errorCode: "SYNC_CHECKPOINT_REQUIRED" }),
    ]);
    expect(scheduleStore.markTransientFailure).toHaveBeenCalled();
    expect(scheduleStore.markBlocked).toHaveBeenCalledWith(schedule.scheduleId, "SYNC_CHECKPOINT_REQUIRED");
    await expect(worker.runOnce()).resolves.toEqual([
      expect.objectContaining({ status: "coalesced", errorCode: "SYNC_ALREADY_RUNNING" }),
    ]);
    expect(scheduleStore.markCoalesced).toHaveBeenCalledWith(schedule.scheduleId);
    expect(workerLog.info).toHaveBeenCalledWith(expect.objectContaining({
      stage: "server.sync.schedule_finished",
      status: "coalesced",
      errorCode: "SYNC_ALREADY_RUNNING",
    }), "PLATFORM_SYNC_SCHEDULE_FINISHED");
  });

  it("keeps the polling delay referenced so the Worker process stays alive", async () => {
    const abortController = new AbortController();
    const delayTimer = setTimeout(() => undefined, 60_000);
    const unref = vi.spyOn(delayTimer, "unref");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockReturnValue(delayTimer);
    const worker = new PlatformSyncWorker({
      scheduleStore: {
        reconcileConfigSchedules: vi.fn(),
        claimDue: vi.fn().mockResolvedValue([]),
        markSuccess: vi.fn(),
        markCoalesced: vi.fn(),
        markTransientFailure: vi.fn(),
        markBlocked: vi.fn(),
      },
      coordinator: { runIncremental: vi.fn() },
      service: {
        incrementalSyncGitHubPullRequests: vi.fn(),
        incrementalSyncLarkBaseTickets: vi.fn(),
        incrementalSyncMeegleWorkitems: vi.fn(),
      },
      concurrency: 1,
      pollIntervalMs: 30_000,
    });

    const running = worker.run(abortController.signal);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(unref).not.toHaveBeenCalled();
    abortController.abort();
    await expect(running).resolves.toBeUndefined();
    setTimeoutSpy.mockRestore();
  });
});

function githubSchedule() {
  return {
    scheduleId: "github:acme/app",
    platform: "github" as const,
    scopeKey: "acme/app",
    intervalSeconds: 600,
    target: { platform: "github" as const, owner: "acme", repo: "app" },
    nextRunAt: "2026-08-26T00:10:00.000Z",
    retryCount: 0,
  };
}

function syncResult() {
  return {
    listed: 1,
    skippedInactive: 0,
    synced: 1,
    cleaned: 1,
    watermarkUpdatedAt: "2026-08-26T00:01:00.000Z",
    watermarkTiebreaker: "2",
  };
}
