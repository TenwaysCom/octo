import {
  resolveGitHubRepoEnvironment,
  resolveMeegleSystemGitHubRepository,
  resolveMeegleSystemEnvironment,
} from "./odoo-devops-environment-mapping.js";

describe("Odoo DevOps environment mapping", () => {
  it("maps Meegle Odoo System labels to one environment", () => {
    expect(resolveMeegleSystemEnvironment("Odoo")).toBe("eu");
    expect(resolveMeegleSystemEnvironment("Odoo EU")).toBe("eu");
    expect(resolveMeegleSystemEnvironment("Odoo/Odoo UK")).toBe("uk");
    expect(resolveMeegleSystemEnvironment("Odoo US")).toBe("us");
    expect(resolveMeegleSystemEnvironment("Odoo EU/Odoo UK")).toBeUndefined();
  });

  it("maps GitHub repository names to one environment", () => {
    expect(resolveGitHubRepoEnvironment("Tenways")).toBe("eu");
    expect(resolveGitHubRepoEnvironment("tenways-ukk")).toBe("uk");
    expect(resolveGitHubRepoEnvironment("odoo_tenways")).toBe("us");
    expect(resolveGitHubRepoEnvironment("unrelated-repo")).toBeUndefined();
  });

  it("maps one Meegle System to its GitHub repository", () => {
    expect(resolveMeegleSystemGitHubRepository("Odoo/Odoo UK")).toEqual({ owner: "TenwaysCom", repo: "tenways-ukk" });
    expect(resolveMeegleSystemGitHubRepository("Odoo US")).toEqual({ owner: "TWS-lance", repo: "odoo_tenways" });
    expect(resolveMeegleSystemGitHubRepository("Odoo EU/Odoo UK")).toBeUndefined();
  });
});
