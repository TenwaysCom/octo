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
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: true });
    expect(cache.get).toHaveBeenCalledWith("odoo-devops:branches:v1:eu");
    expect(client.listBranches).not.toHaveBeenCalled();
  });

  it("fetches an environment-specific snapshot and caches it for ten minutes", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
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
    expect(CACHE_TTL_SECONDS).toBe(600);
  });

  it("uses the configured endpoint cache TTL", async () => {
    const client = { listBranches: vi.fn().mockResolvedValue(snapshot) };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
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
      close: vi.fn(),
    };
    const service = new OdooDevopsBranchesService({ client, cache });

    await expect(service.list("eu")).resolves.toEqual({ ...snapshot, cached: false });
    expect(client.listBranches).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledWith(cacheKey("eu"), JSON.stringify(snapshot), 600);
  });
});
