import { createWebGitHubPrOdooDevopsBuildController } from "./github-pr-odoo-devops-build.controller.js";

describe("web GitHub PR Odoo DevOps build controller", () => {
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
    const odooDevopsBranchesService = { list: vi.fn() };
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
    const odooDevopsBranchesService = { list: vi.fn().mockResolvedValue(snapshot) };
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
          environment: "eu",
          headRef: "feature/m-1140",
          build: { branch: "feature/m-1140", status: "done", result: "success" },
        },
      },
    });
    expect(githubClient.getPullRequest).toHaveBeenCalledWith("TenwaysCom", "Tenways", 1140);
    expect(odooDevopsBranchesService.list).toHaveBeenCalledWith("eu");
  });

  it("does not query GitHub or Odoo DevOps for an unmapped repository", async () => {
    const githubClient = { getPullRequest: vi.fn() };
    const odooDevopsBranchesService = { list: vi.fn() };
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
    expect(odooDevopsBranchesService.list).not.toHaveBeenCalled();
  });

});
