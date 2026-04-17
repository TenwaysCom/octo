import { describe, expect, it } from "vitest";
import app from "./index.js";

function collectRoutes(): string[] {
  const appWithRoutes = app as typeof app & {
    router?: { stack?: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    _router?: { stack?: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  };
  const stack = appWithRoutes.router?.stack ?? appWithRoutes._router?.stack ?? [];

  return stack.flatMap((layer) => {
    const route = layer.route as
      | { path: string; methods: Record<string, boolean> }
      | undefined;

    if (!route) {
      return [];
    }

    return Object.keys(route.methods).map(
      (method) => `${method.toUpperCase()} ${route.path}`,
    );
  });
}

describe("index routes", () => {
  it("registers lark-base and identity routes", () => {
    expect(collectRoutes()).toEqual(
      expect.arrayContaining([
        "POST /api/identity/resolve",
        "POST /api/debug/client-log",
        "GET /api/config/public",
        "POST /api/meegle/auth/exchange",
        "POST /api/meegle/auth/status",
        "POST /api/lark/auth/exchange",
        "POST /api/lark/auth/refresh",
        "POST /api/lark/auth/status",
        "POST /api/lark/auth/session",
        "GET /api/lark/auth/callback",
        "POST /api/pm/analysis/run",
        "POST /api/lark-base/update-meegle-link",
        "POST /api/lark-base/create-meegle-workitem",
      ]),
    );
  });

  it("does not register legacy A1/A2 routes", () => {
    const routes = collectRoutes();
    const legacyRoutes = [
      "/api/a1/analyze",
      "/api/a1/create-b2-draft",
      "/api/a1/apply-b2",
      "/api/a2/analyze",
      "/api/a2/create-b1-draft",
      "/api/a2/apply-b1",
      "/api/lark-bug/analyze",
      "/api/lark-bug/to-meegle-product-bug/draft",
      "/api/lark-bug/to-meegle-product-bug/apply",
      "/api/lark-user-story/analyze",
      "/api/lark-user-story/to-meegle-user-story/draft",
      "/api/lark-user-story/to-meegle-user-story/apply",
    ];
    for (const path of legacyRoutes) {
      expect(routes).not.toContain(`POST ${path}`);
    }
  });
});
