import {
  CACHE_TTL_SECONDS,
  cacheKey,
  OdooDevopsBranchesService,
} from "./odoo-devops-branches.service.js";

const snapshot = {
  environment: "eu" as const,
  project_id: 42,
  project_name: "tenways",
  total: 1,
  items: [{
    database_id: 12345,
    branch: "uat_sprint_0810",
    stage: "staging",
    last_build_status: "done",
    last_build_result: "success",
    odoo_branch: "17.0",
    connect_url: null,
  }],
};

function createCache(overrides: Partial<Record<"get" | "set" | "delete" | "close", ReturnType<typeof vi.fn>>> = {}) {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
    ...overrides,
  };
}

describe("OdooDevopsBranchesService", () => {
  it("returns a validated Redis hit without calling Odoo DevOps", async () => {
    const client = { listBranches: vi.fn() };
    const cache = createCache({ get: vi.fn().mockResolvedValue(JSON.stringify(snapshot)) });
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: true });
    expect(cache.get).toHaveBeenCalledWith("odoo-devops:branches:v2:eu");
    expect(client.listBranches).not.toHaveBeenCalled();
  });

  it("fetches an environment-specific snapshot and caches it for thirty minutes", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = createCache();
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: false });
    expect(client.listBranches).toHaveBeenCalledWith("eu");
    expect(cache.set).toHaveBeenCalledWith(
      cacheKey("eu"),
      JSON.stringify(snapshot),
      CACHE_TTL_SECONDS,
    );
    expect(CACHE_TTL_SECONDS).toBe(1800);
  });

  it("runs the build sync hook after a successful fetch and before publishing the cache", async () => {
    const order: string[] = [];
    const client = { listBranches: vi.fn().mockImplementation(async () => {
      order.push("fetch");
      return snapshot;
    }) };
    const cache = createCache({ set: vi.fn().mockImplementation(async () => {
      order.push("cache");
    }) });
    const onSnapshotSync = vi.fn().mockImplementation(async () => {
      order.push("sync");
    });
    const service = new OdooDevopsBranchesService({ client, cache, onSnapshotSync });

    await service.list("eu");

    expect(onSnapshotSync).toHaveBeenCalledWith(snapshot);
    expect(order).toEqual(["fetch", "sync", "cache"]);
  });

  it("keeps the previous cache when the build sync fails so the snapshot is not marked synced", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = createCache();
    const service = new OdooDevopsBranchesService({
      client,
      cache,
      onSnapshotSync: vi.fn().mockRejectedValue(new Error("db unavailable")),
    });

    await service.getOrStartRefresh("eu");
    await vi.waitFor(async () => {
      // 刷新失败进入有界退避：缓存未发布，退避窗口内不再发起上游请求。
      await expect(service.getOrStartRefresh("eu")).resolves.toEqual({ state: "unavailable" });
    });
    expect(cache.set).not.toHaveBeenCalled();
    expect(client.listBranches).toHaveBeenCalledOnce();
  });

  it("uses the configured endpoint cache TTL", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = createCache();
    const service = new OdooDevopsBranchesService({ client, cache, cacheTtlSeconds: 120 });

    await service.list("eu");

    expect(cache.set).toHaveBeenCalledWith(cacheKey("eu"), JSON.stringify(snapshot), 120);
  });

  it("starts one environment-scoped refresh and returns immediately to concurrent callers", async () => {
    let releaseRefresh: ((value: typeof snapshot) => void) | undefined;
    const refresh = new Promise<typeof snapshot>((resolve) => { releaseRefresh = resolve; });
    const client = { listBranches: vi.fn().mockReturnValue(refresh) };
    const cache = createCache();
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(Promise.all([service.getOrStartRefresh("eu"), service.getOrStartRefresh("eu")]))
      .resolves.toEqual([{ state: "refreshing" }, { state: "refreshing" }]);
    expect(client.listBranches).toHaveBeenCalledOnce();

    releaseRefresh!(snapshot);
    await vi.waitFor(async () => {
      await expect(service.getOrStartRefresh("eu")).resolves.toEqual({
        state: "ready", snapshot, cached: true, stale: false,
      });
    });
  });

  it("bypasses an invalid cache value and replaces it with the remote snapshot", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = createCache({ get: vi.fn().mockResolvedValue("not-json") });
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: false });
    expect(client.listBranches).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledWith(cacheKey("eu"), JSON.stringify(snapshot), 1800);
  });

  it("deletes only the requested environment snapshot", async () => {
    const client = { listBranches: vi.fn() };
    const cache = createCache();
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.invalidate("uk")).resolves.toBe(true);

    expect(cache.delete).toHaveBeenCalledWith(cacheKey("uk"));
    expect(client.listBranches).not.toHaveBeenCalled();
  });

  it("deletes the EU, UK, and US snapshots together", async () => {
    const cache = createCache();
    const service = new OdooDevopsBranchesService({ client: { listBranches: vi.fn() }, cache });

    await expect(service.invalidateAll()).resolves.toBe(true);

    expect(cache.delete).toHaveBeenCalledWith(cacheKey("eu"));
    expect(cache.delete).toHaveBeenCalledWith(cacheKey("uk"));
    expect(cache.delete).toHaveBeenCalledWith(cacheKey("us"));
  });
});

it("forces scheduled refreshes despite a fresh cache and merges them with concurrent page reads", async () => {
  let release!: (value: typeof snapshot) => void;
  const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
  const cache = createCache();
  const onSnapshotSync = vi.fn().mockResolvedValue(undefined);
  const service = new OdooDevopsBranchesService({ client, cache, onSnapshotSync });
  await service.list("eu");
  client.listBranches.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const scheduled = service.refresh("eu");
  expect(service.refresh("eu")).toBe(scheduled);
  expect(client.listBranches).toHaveBeenCalledTimes(2);
  // A fresh page read keeps returning the previous snapshot while the forced refresh runs.
  expect(await service.list("eu")).toMatchObject({ cached: true });
  release({ ...snapshot, items: [] });
  await scheduled;
  expect(onSnapshotSync).toHaveBeenCalledTimes(2);
  expect(await service.list("eu")).toMatchObject({ items: [] });
});

it("does not sync or cache a response from the wrong environment", async () => {
  const client = { listBranches: vi.fn().mockResolvedValue({ ...snapshot, environment: "uk" }) };
  const cache = createCache();
  const onSnapshotSync = vi.fn();
  const service = new OdooDevopsBranchesService({ client, cache, onSnapshotSync });
  await expect(service.refresh("eu")).rejects.toThrow("ODOO_SH_BUILD_ENVIRONMENT_MISMATCH");
  expect(onSnapshotSync).not.toHaveBeenCalled();
  expect(cache.set).not.toHaveBeenCalled();
});
