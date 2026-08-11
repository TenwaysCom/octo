import {
  CACHE_TTL_SECONDS,
  cacheKey,
  OdooDevopsBranchesService,
} from "./odoo-devops-branches.service.js";

const snapshot = {
  environment: "eu" as const,
  project_name: "tenways",
  total: 1,
  items: [{
    branch: "uat_sprint_0810",
    stage: "staging",
    last_build_status: "done",
    last_build_result: "success",
    odoo_branch: "17.0",
  }],
};

describe("OdooDevopsBranchesService", () => {
  it("returns a validated Redis hit without calling Odoo DevOps", async () => {
    const client = { listBranches: vi.fn() };
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(snapshot)),
      set: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: true });
    expect(cache.get).toHaveBeenCalledWith("odoo-devops:branches:v1:eu");
    expect(client.listBranches).not.toHaveBeenCalled();
  });

  it("fetches an environment-specific snapshot and caches it for thirty minutes", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
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

  it("uses the configured endpoint cache TTL", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client, cache, cacheTtlSeconds: 120 });

    await service.list("eu");

    expect(cache.set).toHaveBeenCalledWith(cacheKey("eu"), JSON.stringify(snapshot), 120);
  });

  it("bypasses an invalid cache value and replaces it with the remote snapshot", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = {
      get: vi.fn().mockResolvedValue("not-json"),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: false });
    expect(client.listBranches).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledWith(cacheKey("eu"), JSON.stringify(snapshot), 1800);
  });

  it("deletes only the requested environment snapshot", async () => {
    const client = { listBranches: vi.fn() };
    const cache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.invalidate("uk")).resolves.toBe(true);

    expect(cache.delete).toHaveBeenCalledWith(cacheKey("uk"));
    expect(client.listBranches).not.toHaveBeenCalled();
  });

  it("deletes the EU, UK, and US snapshots together", async () => {
    const cache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client: { listBranches: vi.fn() }, cache });

    await expect(service.invalidateAll()).resolves.toBe(true);

    expect(cache.delete).toHaveBeenCalledWith(cacheKey("eu"));
    expect(cache.delete).toHaveBeenCalledWith(cacheKey("uk"));
    expect(cache.delete).toHaveBeenCalledWith(cacheKey("us"));
  });
});
