import { createHttpOdooDevopsBranchesClient } from "./odoo-devops-branches-client.js";

describe("Odoo DevOps branches client", () => {
  it.each(["eu", "uk", "us"] as const)("requests %s branches with the server-held session only", async (environment) => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ items: [] }),
    });
    const client = createHttpOdooDevopsBranchesClient({
      baseUrl: "https://devops.odoo.tenways.it:18443",
      session: "server-held-session",
      fetchImpl,
    });

    await expect(client.listBranches(environment)).resolves.toEqual({ items: [] });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(`https://devops.odoo.tenways.it:18443/api/v1/odoo-sh/${environment}/branches?stage=all`),
      expect.objectContaining({
        headers: {
          accept: "application/json",
          cookie: "odoo_devops_new_prod_session=server-held-session",
        },
        redirect: "manual",
      }),
    );
  });

  it("rejects missing credentials before making a request", async () => {
    const fetchImpl = vi.fn();
    const client = createHttpOdooDevopsBranchesClient({
      baseUrl: "https://devops.odoo.tenways.it:18443",
      session: "",
      fetchImpl,
    });

    await expect(client.listBranches("eu")).rejects.toMatchObject({
      code: "ODOO_DEVOPS_NOT_CONFIGURED",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([401, 403, 302])("maps authentication responses to a credential error (%s)", async (status) => {
    const client = createHttpOdooDevopsBranchesClient({
      baseUrl: "https://devops.odoo.tenways.it:18443",
      session: "server-held-session",
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status }),
    });

    await expect(client.listBranches("eu")).rejects.toMatchObject({
      code: "ODOO_DEVOPS_AUTH_REQUIRED",
    });
  });
});
