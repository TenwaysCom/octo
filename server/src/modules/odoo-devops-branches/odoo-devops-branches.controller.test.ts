import { OdooDevopsBranchesClientError } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import { createWebOdooDevopsBranchesCacheResetController, createWebOdooDevopsBranchesController } from "./odoo-devops-branches.controller.js";

const snapshot = {
  environment: "uk" as const,
  project_id: 42,
  project_name: "tenways-uk",
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

describe("web Odoo DevOps branches controller", () => {
  it("requires the opaque Octo web session", async () => {
    const service = { getOrStartRefresh: vi.fn() };
    const controller = createWebOdooDevopsBranchesController({
      service,
      ensureSession: vi.fn().mockResolvedValue({
        ok: false,
        errorCode: "UNAUTHENTICATED",
        errorMessage: "Missing web session.",
      }),
    });

    await expect(controller({ cookieHeader: undefined, query: { environment: "eu" } })).resolves.toEqual({
      statusCode: 401,
      body: { ok: false, error: { errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." } },
    });
    expect(service.getOrStartRefresh).not.toHaveBeenCalled();
  });

  it("returns the cached snapshot immediately with staleness flagged", async () => {
    const service = {
      getOrStartRefresh: vi.fn().mockResolvedValue({
        state: "ready",
        snapshot,
        cached: true,
        stale: true,
      }),
    };
    const ensureSession = vi.fn().mockResolvedValue({ ok: true, user: {} });
    const controller = createWebOdooDevopsBranchesController({ service, ensureSession });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      query: { environment: "uk" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { ...snapshot, cached: true, stale: true } },
    });
    expect(ensureSession).toHaveBeenCalledWith("web-session");
    expect(service.getOrStartRefresh).toHaveBeenCalledWith("uk");
  });

  it("answers cold cache reads with 202 refreshing and a bounded retry hint", async () => {
    const service = { getOrStartRefresh: vi.fn().mockResolvedValue({ state: "refreshing" }) };
    const controller = createWebOdooDevopsBranchesController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      query: { environment: "eu" },
    })).resolves.toEqual({
      statusCode: 202,
      body: {
        ok: true,
        data: { state: "refreshing", environment: "eu", retryAfterMs: 1_000 },
      },
    });
  });

  it("answers a throttled refresh failure with 503 instead of hanging", async () => {
    const service = { getOrStartRefresh: vi.fn().mockResolvedValue({ state: "unavailable" }) };
    const controller = createWebOdooDevopsBranchesController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      query: { environment: "us" },
    })).resolves.toEqual({
      statusCode: 503,
      body: {
        ok: false,
        error: {
          errorCode: "ODOO_DEVOPS_UNAVAILABLE",
          errorMessage: "Odoo DevOps 分支状态暂时不可用。",
        },
      },
    });
  });

  it("rejects an unsupported environment before invoking the service", async () => {
    const service = { getOrStartRefresh: vi.fn() };
    const controller = createWebOdooDevopsBranchesController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({ cookieHeader: "octo_web_session=web-session", query: { environment: "cn" } }))
      .resolves.toMatchObject({ statusCode: 400, body: { ok: false, error: { errorCode: "INVALID_REQUEST" } } });
    expect(service.getOrStartRefresh).not.toHaveBeenCalled();
  });

  it("returns a safe service-unavailable response when the Odoo DevOps session is rejected", async () => {
    const service = {
      getOrStartRefresh: vi.fn().mockRejectedValue(new OdooDevopsBranchesClientError("ODOO_DEVOPS_AUTH_REQUIRED")),
    };
    const controller = createWebOdooDevopsBranchesController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({ cookieHeader: "octo_web_session=web-session", query: { environment: "eu" } }))
      .resolves.toEqual({
        statusCode: 503,
        body: {
          ok: false,
          error: {
            errorCode: "ODOO_DEVOPS_AUTH_REQUIRED",
            errorMessage: "Odoo DevOps 分支状态暂时不可用。",
          },
        },
      });
  });

  it("resets the EU, UK, and US caches with the opaque web session", async () => {
    const service = { invalidateAll: vi.fn().mockResolvedValue(true) };
    const controller = createWebOdooDevopsBranchesCacheResetController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      body: { actionRunId: "reset_all" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { environments: ["eu", "uk", "us"], actionRunId: "reset_all" } },
    });
    expect(service.invalidateAll).toHaveBeenCalledOnce();
  });

  it("reports reset unavailability rather than claiming all caches were deleted", async () => {
    const controller = createWebOdooDevopsBranchesCacheResetController({
      service: { invalidateAll: vi.fn().mockResolvedValue(false) },
      ensureSession: vi.fn().mockResolvedValue({ ok: true, user: {} }),
    });

    await expect(controller({
      cookieHeader: "octo_web_session=web-session",
      body: { actionRunId: "reset_all" },
    })).resolves.toMatchObject({ statusCode: 503, body: { ok: false, error: { errorCode: "ODOO_DEVOPS_CACHE_RESET_UNAVAILABLE" } } });
  });
});
