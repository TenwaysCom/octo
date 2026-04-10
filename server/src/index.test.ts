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
  it("registers the new lark-bug and lark-user-story aliases alongside legacy paths", () => {
    expect(collectRoutes()).toEqual(
      expect.arrayContaining([
        "POST /api/lark-bug/analyze",
        "POST /api/lark-bug/to-meegle-product-bug/draft",
        "POST /api/lark-bug/to-meegle-product-bug/apply",
        "POST /api/lark-user-story/analyze",
        "POST /api/lark-user-story/to-meegle-user-story/draft",
        "POST /api/lark-user-story/to-meegle-user-story/apply",
        "POST /api/a1/analyze",
        "POST /api/a1/create-b2-draft",
        "POST /api/a1/apply-b2",
        "POST /api/a2/analyze",
        "POST /api/a2/create-b1-draft",
        "POST /api/a2/apply-b1",
      ]),
    );
  });
});
