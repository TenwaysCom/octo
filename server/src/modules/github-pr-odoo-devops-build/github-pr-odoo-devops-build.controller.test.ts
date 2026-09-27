import { createWebGitHubPrOdooDevopsBuildController } from "./github-pr-odoo-devops-build.controller.js";

describe("web GitHub PR Odoo DevOps build controller", () => {
  const allBuilds = {
    actionRunId: "batch-test",
    environments: ["eu", "uk", "us"].map((environment) => ({
      environment, state: "ready", stale: false,
      builds: [{ branch: "shared-branch", status: "done", result: "success", connect_url: "must-not-leak" }],
    })),
  };

  it("returns all environments in one authenticated request without GitHub calls or raw snapshot fields", async () => {
    const githubClient = { getPullRequest: vi.fn() };
    const odooDevopsBranchesService = { getOrStartRefresh: vi.fn(), listBuildStatuses: vi.fn().mockResolvedValue(allBuilds) };
    const controller = createWebGitHubPrOdooDevopsBuildController({
      githubClient, odooDevopsBranchesService,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });
    const result = await controller({ cookieHeader: "octo_web_session=session", query: { all: "true", actionRunId: "batch-test" } });
    expect(result).toMatchObject({ statusCode: 200, body: { ok: true, data: { actionRunId: "batch-test", environments: expect.any(Array) } } });
    expect(JSON.stringify(result)).not.toContain("connect_url");
    expect(odooDevopsBranchesService.listBuildStatuses).toHaveBeenCalledExactlyOnceWith("batch-test");
    expect(odooDevopsBranchesService.getOrStartRefresh).not.toHaveBeenCalled();
    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
  });

  it("requires a session for all-build reads before querying the service", async () => {
    const odooDevopsBranchesService = { getOrStartRefresh: vi.fn(), listBuildStatuses: vi.fn() };
    const controller = createWebGitHubPrOdooDevopsBuildController({
      odooDevopsBranchesService,
      ensureSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED" }),
    });
    expect(await controller({ cookieHeader: undefined, query: { all: "true", actionRunId: "batch-test" } })).toMatchObject({ statusCode: 401 });
    expect(odooDevopsBranchesService.listBuildStatuses).not.toHaveBeenCalled();
  });

  it.each([
    { all: "true" },
    { all: "false", actionRunId: "batch-test" },
    { all: ["true"], actionRunId: "batch-test" },
    { all: "true", actionRunId: " ", owner: "owner" },
    { all: "true", actionRunId: "batch-test", owner: "owner", repo: "Tenways", pullNumber: 1 },
  ])("rejects malformed or ambiguous all-build query %j", async (query) => {
    const odooDevopsBranchesService = { getOrStartRefresh: vi.fn(), listBuildStatuses: vi.fn() };
    const controller = createWebGitHubPrOdooDevopsBuildController({ odooDevopsBranchesService, ensureSession: vi.fn().mockResolvedValue({ ok: true }) });
    expect(await controller({ cookieHeader: undefined, query })).toMatchObject({ statusCode: 400 });
    expect(odooDevopsBranchesService.listBuildStatuses).not.toHaveBeenCalled();
    expect(odooDevopsBranchesService.getOrStartRefresh).not.toHaveBeenCalled();
  });

  const snapshot = {
    environment: "eu" as const,
    project_name: "Tenways",
    total: 1,
    cached: true,
    items: [{
      branch: "feature/m-1140",
      stage: "staging",
      last_build_status: "done",
      last_build_result: "success",
      odoo_branch: "18.0",
    }],
  };

  it("requires the opaque Octo web session", async () => {
    const githubClient = { getPullRequest: vi.fn() };
    const odooDevopsBranchesService = { listBuildStatuses: vi.fn(), getOrStartRefresh: vi.fn() };
    const controller = createWebGitHubPrOdooDevopsBuildController({
      githubClient,
      odooDevopsBranchesService,
      ensureSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." }),
    });

    await expect(controller({ cookieHeader: undefined, query: { owner: "TenwaysCom", repo: "Tenways", pullNumber: "1140" } }))
      .resolves.toMatchObject({ statusCode: 401, body: { ok: false, error: { errorCode: "UNAUTHENTICATED" } } });
    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
  });

  it("maps the repository to EU and matches the current GitHub head ref only", async () => {
    const githubClient = { getPullRequest: vi.fn().mockResolvedValue({ head: { ref: "feature/m-1140" } }) };
    const odooDevopsBranchesService = { listBuildStatuses: vi.fn(), getOrStartRefresh: vi.fn().mockResolvedValue({
      state: "ready",
      snapshot,
      cached: true,
      stale: false,
    }) };
    const controller = createWebGitHubPrOdooDevopsBuildController({
      githubClient,
      odooDevopsBranchesService,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      query: { owner: "TenwaysCom", repo: "Tenways", pullNumber: "1140" },
    })).resolves.toEqual({
      statusCode: 200,
      body: {
        ok: true,
        data: {
          state: "ready",
          environment: "eu",
          headRef: "feature/m-1140",
          build: { branch: "feature/m-1140", status: "done", result: "success" },
          stale: false,
        },
      },
    });
    expect(githubClient.getPullRequest).toHaveBeenCalledWith("TenwaysCom", "Tenways", 1140);
    expect(odooDevopsBranchesService.getOrStartRefresh).toHaveBeenCalledWith("eu");
  });

  it("returns 202 while an environment snapshot is refreshing", async () => {
    const githubClient = { getPullRequest: vi.fn() };
    const odooDevopsBranchesService = { listBuildStatuses: vi.fn(), getOrStartRefresh: vi.fn().mockResolvedValue({ state: "refreshing" }) };
    const controller = createWebGitHubPrOdooDevopsBuildController({
      githubClient,
      odooDevopsBranchesService,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      query: { owner: "TenwaysCom", repo: "Tenways", pullNumber: "1140", headRef: "feature/m-1140" },
    })).resolves.toEqual({
      statusCode: 202,
      body: { ok: true, data: {
        state: "refreshing", environment: "eu", headRef: "feature/m-1140", build: null, retryAfterMs: 1000,
      } },
    });
    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
    expect(odooDevopsBranchesService.getOrStartRefresh).toHaveBeenCalledWith("eu");
  });

  it("does not query GitHub or Odoo DevOps for an unmapped repository", async () => {
    const githubClient = { getPullRequest: vi.fn() };
    const odooDevopsBranchesService = { listBuildStatuses: vi.fn(), getOrStartRefresh: vi.fn() };
    const controller = createWebGitHubPrOdooDevopsBuildController({
      githubClient,
      odooDevopsBranchesService,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      query: { owner: "TenwaysCom", repo: "unmapped", pullNumber: "1140" },
    })).resolves.toMatchObject({ statusCode: 404, body: { ok: false, error: { errorCode: "ODOO_DEVOPS_REPO_UNMAPPED" } } });
    expect(githubClient.getPullRequest).not.toHaveBeenCalled();
    expect(odooDevopsBranchesService.getOrStartRefresh).not.toHaveBeenCalled();
  });

});
