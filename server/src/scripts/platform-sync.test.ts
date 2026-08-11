import {
  DEFAULT_PLATFORM_SYNC_CONFIG_PATH,
  parsePlatformSyncArgs,
  parsePlatformSyncConfig,
  runIncrementalScopes,
  runPlatformSync,
  runPlatformSyncCleaning,
  syncIncrementalGitHubPullRequestsWithGh,
  syncGitHubPullRequestsWithGh,
  type PlatformSyncConfig,
  type PlatformSyncRunner,
} from "./platform-sync.js";

function config(overrides: Partial<PlatformSyncConfig> = {}): PlatformSyncConfig {
  return parsePlatformSyncConfig({
    meegle: [{ projectKey: "project", workItemTypeKeys: ["story"] }],
    github: [{ owner: "acme", repo: "app" }],
    larkBase: [{ baseId: "base", tableId: "table", statusFieldName: "Status" }],
    ...overrides,
  });
}

function runner(overrides: Partial<PlatformSyncRunner> = {}): PlatformSyncRunner {
  return {
    bulkSyncMeegleWorkitems: vi.fn().mockResolvedValue({ listed: 2, skippedInactive: 1, synced: 1 }),
    bulkSyncGitHubPullRequests: vi.fn().mockResolvedValue({ listed: 3, skippedInactive: 0, synced: 3 }),
    bulkSyncLarkBaseTickets: vi.fn().mockResolvedValue({ listed: 4, skippedInactive: 2, synced: 2 }),
    ...overrides,
  } as PlatformSyncRunner;
}

describe("platform-sync script", () => {
  it("uses the documented default user and local config path", () => {
    const args = parsePlatformSyncArgs([]);

    expect(args.masterUserId).toBe("a400632e-8d08-4ddf-977d-e8330b0adc5a");
    expect(args.configPath).toBe(DEFAULT_PLATFORM_SYNC_CONFIG_PATH);
    expect(args.only).toBeUndefined();
    expect(args.githubPullRequestState).toBe("all");
    expect(args.githubPullRequestLimit).toBe(100);
    expect(args.mode).toBe("full");
    expect(args.cleanAfterSync).toBe(true);
  });

  it("parses platform, user, and config overrides", () => {
    expect(parsePlatformSyncArgs([
      "--only", "github",
      "--user-id", "user-2",
      "--config", "/tmp/sync.json",
      "--github-pr-state", "merged",
      "--github-pr-limit", "25",
      "--mode", "incremental",
      "--scope", "acme/app",
      "--clean-after-sync",
    ])).toMatchObject({
      only: "github",
      masterUserId: "user-2",
      configPath: "/tmp/sync.json",
      githubPullRequestState: "merged",
      githubPullRequestLimit: 25,
      mode: "incremental",
      scope: "acme/app",
      cleanAfterSync: true,
    });
    expect(() => parsePlatformSyncArgs(["--only", "unknown"])).toThrow();
    expect(() => parsePlatformSyncArgs(["--config"])).toThrow("Missing value for --config");
    expect(() => parsePlatformSyncArgs(["--github-pr-limit", "1001"])).toThrow("--github-pr-limit");
    expect(() => parsePlatformSyncArgs(["--mode", "incremental", "--only", "lark", "--scope", "base/table"])).toThrow("--scope is only supported");
    expect(() => parsePlatformSyncArgs(["--mode", "incremental", "--only", "github"])).toThrow("GitHub incremental");
    expect(parsePlatformSyncArgs(["--mode", "incremental", "--only", "lark"])).toMatchObject({ only: "lark", mode: "incremental" });
    expect(parsePlatformSyncArgs(["--mode", "full", "--clean-after-sync"])).toMatchObject({ mode: "full", cleanAfterSync: true });
    expect(parsePlatformSyncArgs(["--mode", "clean", "--only", "github"])).toMatchObject({ only: "github", mode: "clean", cleanAfterSync: true });
    expect(() => parsePlatformSyncArgs(["--mode", "clean", "--scope", "acme/app"])).toThrow("--scope is not supported");
    expect(() => parsePlatformSyncArgs(["--unexpected"])).toThrow("Unknown argument");
  });

  it("validates targets and permits an independently configured platform", () => {
    expect(parsePlatformSyncConfig({ github: [{ owner: "acme", repo: "app" }] }))
      .toMatchObject({ meegle: [], larkBase: [], github: [{ owner: "acme", repo: "app" }] });
    expect(() => parsePlatformSyncConfig({})).toThrow("At least one Meegle");
    expect(() => parsePlatformSyncConfig({ larkBase: [{ baseId: "base" }] })).toThrow();
  });

  it("runs all configured platforms in order by default", async () => {
    const syncRunner = runner();
    const result = await runPlatformSync(parsePlatformSyncArgs([]), config(), syncRunner);

    expect(result).toMatchObject({ failed: false });
    expect(result.entries.map((entry) => entry.platform)).toEqual(["meegle", "github", "github", "lark"]);
    expect(syncRunner.bulkSyncMeegleWorkitems).toHaveBeenCalledWith({
      masterUserId: "a400632e-8d08-4ddf-977d-e8330b0adc5a",
      projectKey: "project",
      workItemTypeKeys: ["story"],
      cleanAfterSync: true,
    });
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(1, {
      repositories: [{ owner: "acme", repo: "app" }],
      state: "closed",
      limit: 100,
      cleanAfterSync: true,
    });
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(2, {
      repositories: [{ owner: "acme", repo: "app" }],
      state: "merged",
      limit: 100,
      cleanAfterSync: true,
    });
  });

  it("runs only the selected platform", async () => {
    const syncRunner = runner();
    const args = parsePlatformSyncArgs(["--only", "github"]);

    const result = await runPlatformSync(args, config(), syncRunner);

    expect(result.entries.map((entry) => entry.platform)).toEqual(["github", "github"]);
    expect(syncRunner.bulkSyncMeegleWorkitems).not.toHaveBeenCalled();
    expect(syncRunner.bulkSyncLarkBaseTickets).not.toHaveBeenCalled();
  });

  it("isolates GitHub repository failures so later repositories still run", async () => {
    const syncRunner = runner({
      bulkSyncGitHubPullRequests: vi.fn()
        .mockRejectedValueOnce(new Error("Repository unavailable"))
        .mockResolvedValue({ listed: 1, skippedInactive: 0, synced: 1 }),
    });
    const result = await runPlatformSync(
      parsePlatformSyncArgs(["--only", "github"]),
      config({ github: [{ owner: "acme", repo: "missing" }, { owner: "acme", repo: "app" }] }),
      syncRunner,
    );

    expect(result.failed).toBe(true);
    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "github", target: "acme/missing (closed)", ok: false }),
      expect.objectContaining({ platform: "github", target: "acme/app (closed)", ok: true }),
    ]));
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(1, {
      repositories: [{ owner: "acme", repo: "missing" }],
      state: "closed",
      limit: 100,
      cleanAfterSync: true,
    });
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(2, {
      repositories: [{ owner: "acme", repo: "missing" }],
      state: "merged",
      limit: 100,
      cleanAfterSync: true,
    });
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(3, {
      repositories: [{ owner: "acme", repo: "app" }],
      state: "closed",
      limit: 100,
      cleanAfterSync: true,
    });
  });

  it("cleans configured snapshots without calling any source platform", async () => {
    const cleanRunner = {
      cleanMeegleProject: vi.fn().mockResolvedValue({ listed: 2, skippedInactive: 0, synced: 0, cleaned: 1 }),
      cleanGitHubRepository: vi.fn().mockResolvedValue({ listed: 3, skippedInactive: 0, synced: 0, cleaned: 2 }),
      cleanLarkBase: vi.fn().mockResolvedValue({ listed: 4, skippedInactive: 0, synced: 0, cleaned: 3 }),
    };

    const result = await runPlatformSyncCleaning(parsePlatformSyncArgs(["--mode", "clean"]), config(), cleanRunner);

    expect(result.failed).toBe(false);
    expect(result.entries.map((entry) => entry.platform)).toEqual(["meegle", "github", "lark"]);
    expect(cleanRunner.cleanMeegleProject).toHaveBeenCalledWith("project");
    expect(cleanRunner.cleanGitHubRepository).toHaveBeenCalledWith("acme", "app");
    expect(cleanRunner.cleanLarkBase).toHaveBeenCalledWith("base", "table");
  });

  it("continues after a platform failure and reports an overall failure", async () => {
    const syncRunner = runner({
      bulkSyncGitHubPullRequests: vi.fn().mockRejectedValue(new Error("GitHub unavailable")),
    });

    const result = await runPlatformSync(parsePlatformSyncArgs([]), config(), syncRunner);

    expect(result.failed).toBe(true);
    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "github", ok: false, errorMessage: "GitHub unavailable" }),
      expect.objectContaining({ platform: "lark", ok: true }),
    ]));
    expect(syncRunner.bulkSyncLarkBaseTickets).toHaveBeenCalledTimes(1);
  });

  it("continues incremental scopes after a failed scope and records each checkpoint outcome", async () => {
    const getCheckpoint = vi.fn().mockResolvedValue({
      platform: "meegle",
      scopeKey: "project",
      watermarkUpdatedAt: "2026-08-11T00:00:00.000Z",
      watermarkTiebreaker: "story:0",
    });
    const sync = vi.fn()
      .mockRejectedValueOnce(new Error("first project unavailable"))
      .mockResolvedValueOnce({
        listed: 2,
        skippedInactive: 0,
        synced: 1,
        cleaned: 1,
        watermarkUpdatedAt: "2026-08-11T00:02:00.000Z",
        watermarkTiebreaker: "story:2",
      });
    const markSuccess = vi.fn().mockResolvedValue(undefined);
    const markFailure = vi.fn().mockResolvedValue(undefined);

    const result = await runIncrementalScopes("meegle", [
      { scope: "first", target: { projectKey: "first" } },
      { scope: "second", target: { projectKey: "second" } },
    ], { getCheckpoint, sync, markSuccess, markFailure });

    expect(result).toMatchObject({ failed: true });
    expect(result.entries).toEqual([
      expect.objectContaining({ platform: "meegle", target: "first", ok: false, errorMessage: "first project unavailable" }),
      expect.objectContaining({ platform: "meegle", target: "second", ok: true, watermarkTiebreaker: "story:2" }),
    ]);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(markFailure).toHaveBeenCalledWith("first", expect.any(Error));
    expect(markSuccess).toHaveBeenCalledWith(expect.objectContaining({ scopeKey: "project" }), expect.objectContaining({ watermarkTiebreaker: "story:2" }));
  });

  it("reports an incremental platform with no configured scopes", async () => {
    await expect(runIncrementalScopes("lark", [], {
      getCheckpoint: vi.fn(),
      sync: vi.fn(),
      markSuccess: vi.fn(),
      markFailure: vi.fn(),
    })).resolves.toEqual({
      failed: true,
      entries: [{ platform: "lark", target: "configuration", ok: false, errorMessage: "No lark targets configured" }],
    });
  });

  it("reports an explicit selected platform with no configured target", async () => {
    const syncRunner = runner();
    const result = await runPlatformSync(
      parsePlatformSyncArgs(["--only", "meegle"]),
      config({ meegle: [] }),
      syncRunner,
    );

    expect(result).toEqual({
      failed: true,
      entries: [{
        platform: "meegle",
        target: "configuration",
        ok: false,
        errorMessage: "No meegle targets configured",
      }],
    });
  });

  it("reads the requested recent PR state through gh and stores detailed snapshots", async () => {
    const store = {
      upsertGitHubPullRequest: vi.fn().mockResolvedValue(undefined),
    };
    const runGh = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([{ number: 17 }]))
      .mockResolvedValueOnce(JSON.stringify({
        number: 17,
        title: "Sync PR",
        body: null,
        html_url: "https://github.com/acme/app/pull/17",
        state: "open",
        merged_at: null,
        updated_at: "2026-08-07T00:00:00.000Z",
        draft: false,
      }));

    await expect(syncGitHubPullRequestsWithGh(
      { repositories: [{ owner: "acme", repo: "app" }], state: "merged", limit: 100 },
      store as never,
      runGh,
    )).resolves.toEqual({ listed: 1, skippedInactive: 0, synced: 1, refs: [{ owner: "acme", repo: "app", pullNumber: 17 }] });
    expect(runGh).toHaveBeenNthCalledWith(1, expect.arrayContaining([
      "pr", "list", "--repo", "acme/app", "--state", "merged", "--limit", "100",
    ]));
    expect(store.upsertGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      owner: "acme",
      repo: "app",
      pullRequest: expect.objectContaining({ number: 17 }),
    }));
  });

  it("excludes merged PRs from the regular closed PR sync", async () => {
    const store = {
      upsertGitHubPullRequest: vi.fn().mockResolvedValue(undefined),
    };
    const runGh = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([{ number: 17 }, { number: 18 }]))
      .mockResolvedValueOnce(JSON.stringify({
        number: 17,
        title: "Merged PR",
        html_url: "https://github.com/acme/app/pull/17",
        state: "closed",
        merged_at: "2026-08-08T00:00:00.000Z",
      }))
      .mockResolvedValueOnce(JSON.stringify({
        number: 18,
        title: "Closed PR",
        html_url: "https://github.com/acme/app/pull/18",
        state: "closed",
        merged_at: null,
      }));

    await expect(syncGitHubPullRequestsWithGh(
      { repositories: [{ owner: "acme", repo: "app" }], state: "closed", limit: 100 },
      store as never,
      runGh,
    )).resolves.toEqual({ listed: 2, skippedInactive: 1, synced: 1, refs: [{ owner: "acme", repo: "app", pullNumber: 18 }] });
    expect(store.upsertGitHubPullRequest).toHaveBeenCalledTimes(1);
    expect(store.upsertGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      pullRequest: expect.objectContaining({ number: 18 }),
    }));
  });

  it("syncs the GitHub overlap window, includes terminal PRs, and returns the next watermark", async () => {
    const store = { upsertGitHubPullRequest: vi.fn().mockResolvedValue(undefined) };
    const runGh = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([{ number: 15 }, { number: 12 }]))
      .mockResolvedValueOnce(JSON.stringify({
        number: 15, title: "Merged PR", html_url: "https://github.com/acme/app/pull/15", state: "closed",
        merged_at: "2026-08-11T08:03:00.000Z", updated_at: "2026-08-11T08:03:00.000Z",
      }))
      .mockResolvedValueOnce(JSON.stringify({
        number: 12, title: "Open PR", html_url: "https://github.com/acme/app/pull/12", state: "open",
        merged_at: null, updated_at: "2026-08-11T08:02:00.000Z",
      }));

    await expect(syncIncrementalGitHubPullRequestsWithGh({
      owner: "acme",
      repo: "app",
      watermarkUpdatedAt: "2026-08-11T08:00:00.000Z",
      watermarkTiebreaker: "000000000010",
      limit: 100,
    }, store as never, runGh)).resolves.toEqual(expect.objectContaining({
      listed: 2,
      synced: 2,
      refs: [
        { owner: "acme", repo: "app", pullNumber: 12 },
        { owner: "acme", repo: "app", pullNumber: 15 },
      ],
      watermarkUpdatedAt: "2026-08-11T08:03:00.000Z",
      watermarkTiebreaker: "000000000015",
    }));
    expect(runGh).toHaveBeenNthCalledWith(1, expect.arrayContaining([
      "pr", "list", "--state", "all", "--search", "updated:>=2026-08-11T07:55:00.000Z",
    ]));
    expect(store.upsertGitHubPullRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      pullRequest: expect.objectContaining({ number: 12 }),
    }));
  });

  it("does not write or advance an incomplete GitHub incremental page", async () => {
    const store = { upsertGitHubPullRequest: vi.fn() };
    const runGh = vi.fn().mockResolvedValue(JSON.stringify([{ number: 1 }, { number: 2 }]));

    await expect(syncIncrementalGitHubPullRequestsWithGh({
      owner: "acme", repo: "app", watermarkUpdatedAt: "2026-08-11T08:00:00.000Z",
      watermarkTiebreaker: "000000000001", limit: 2,
    }, store as never, runGh)).rejects.toThrow("reached --github-pr-limit=2");
    expect(store.upsertGitHubPullRequest).not.toHaveBeenCalled();
  });
});
