import {
  DEFAULT_PLATFORM_SYNC_CONFIG_PATH,
  parsePlatformSyncArgs,
  parsePlatformSyncConfig,
  runPlatformSync,
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
    expect(args.githubPullRequestState).toBe("closed");
    expect(args.githubPullRequestLimit).toBe(100);
  });

  it("parses platform, user, and config overrides", () => {
    expect(parsePlatformSyncArgs([
      "--only", "lark",
      "--user-id", "user-2",
      "--config", "/tmp/sync.json",
      "--github-pr-state", "merged",
      "--github-pr-limit", "25",
    ])).toMatchObject({
      only: "lark",
      masterUserId: "user-2",
      configPath: "/tmp/sync.json",
      githubPullRequestState: "merged",
      githubPullRequestLimit: 25,
    });
    expect(() => parsePlatformSyncArgs(["--only", "unknown"])).toThrow();
    expect(() => parsePlatformSyncArgs(["--config"])).toThrow("Missing value for --config");
    expect(() => parsePlatformSyncArgs(["--github-pr-limit", "101"])).toThrow("--github-pr-limit");
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
    expect(result.entries.map((entry) => entry.platform)).toEqual(["meegle", "github", "lark"]);
    expect(syncRunner.bulkSyncMeegleWorkitems).toHaveBeenCalledWith({
      masterUserId: "a400632e-8d08-4ddf-977d-e8330b0adc5a",
      projectKey: "project",
      workItemTypeKeys: ["story"],
    });
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenCalledWith({
      repositories: [{ owner: "acme", repo: "app" }],
      state: "closed",
      limit: 100,
    });
  });

  it("runs only the selected platform", async () => {
    const syncRunner = runner();
    const args = parsePlatformSyncArgs(["--only", "github"]);

    const result = await runPlatformSync(args, config(), syncRunner);

    expect(result.entries.map((entry) => entry.platform)).toEqual(["github"]);
    expect(syncRunner.bulkSyncMeegleWorkitems).not.toHaveBeenCalled();
    expect(syncRunner.bulkSyncLarkBaseTickets).not.toHaveBeenCalled();
  });

  it("isolates GitHub repository failures so later repositories still run", async () => {
    const syncRunner = runner({
      bulkSyncGitHubPullRequests: vi.fn()
        .mockRejectedValueOnce(new Error("Repository unavailable"))
        .mockResolvedValueOnce({ listed: 1, skippedInactive: 0, synced: 1 }),
    });
    const result = await runPlatformSync(
      parsePlatformSyncArgs(["--only", "github"]),
      config({ github: [{ owner: "acme", repo: "missing" }, { owner: "acme", repo: "app" }] }),
      syncRunner,
    );

    expect(result.failed).toBe(true);
    expect(result.entries).toEqual([
      expect.objectContaining({ platform: "github", target: "acme/missing", ok: false }),
      expect.objectContaining({ platform: "github", target: "acme/app", ok: true }),
    ]);
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(1, {
      repositories: [{ owner: "acme", repo: "missing" }],
      state: "closed",
      limit: 100,
    });
    expect(syncRunner.bulkSyncGitHubPullRequests).toHaveBeenNthCalledWith(2, {
      repositories: [{ owner: "acme", repo: "app" }],
      state: "closed",
      limit: 100,
    });
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
    )).resolves.toEqual({ listed: 1, skippedInactive: 0, synced: 1 });
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
    )).resolves.toEqual({ listed: 2, skippedInactive: 1, synced: 1 });
    expect(store.upsertGitHubPullRequest).toHaveBeenCalledTimes(1);
    expect(store.upsertGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      pullRequest: expect.objectContaining({ number: 18 }),
    }));
  });
});
