import { describe, expect, it, vi } from "vitest";
import { registerLarkMeegleWorkflowRoutes } from "./lark-meegle-workflow-routes.js";

describe("registerLarkMeegleWorkflowRoutes", () => {
  it("registers the renamed public routes and their legacy aliases", () => {
    const app = {
      post: vi.fn(),
    };
    const handleController = vi.fn((controller) => controller);

    registerLarkMeegleWorkflowRoutes(app as never, handleController);

    const registeredPaths = app.post.mock.calls.map(([path]) => path);
    expect(registeredPaths).toEqual(expect.arrayContaining([
      "/api/lark-bug/analyze",
      "/api/lark-bug/to-meegle-product-bug/draft",
      "/api/lark-bug/to-meegle-product-bug/apply",
      "/api/lark-user-story/analyze",
      "/api/lark-user-story/to-meegle-user-story/draft",
      "/api/lark-user-story/to-meegle-user-story/apply",
      "/api/a1/analyze",
      "/api/a1/create-b2-draft",
      "/api/a1/apply-b2",
      "/api/a2/analyze",
      "/api/a2/create-b1-draft",
      "/api/a2/apply-b1",
    ]));
    expect(registeredPaths).toHaveLength(12);
  });
});
