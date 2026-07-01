import { describe, expect, it, vi } from "vitest";
import { registerLarkMeegleWorkflowRoutes } from "./lark-meegle-workflow-routes.js";

describe("registerLarkMeegleWorkflowRoutes", () => {
  it("does not register any legacy routes", () => {
    const app = {
      post: vi.fn(),
    };
    const handleController = vi.fn((controller) => controller);

    registerLarkMeegleWorkflowRoutes(app as never, handleController);

    expect(app.post).not.toHaveBeenCalled();
  });
});
