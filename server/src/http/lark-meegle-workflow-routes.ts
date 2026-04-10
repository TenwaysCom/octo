import type { Application, Request, Response, RequestHandler } from "express";
import {
  analyzeA1Controller,
  createB2DraftController,
  applyB2Controller,
} from "../modules/a1/a1.controller.js";
import {
  analyzeA2Controller,
  createB1DraftController,
  applyB1Controller,
} from "../modules/a2/a2.controller.js";

type ControllerFn = (input: unknown) => Promise<unknown>;

export function registerLarkMeegleWorkflowRoutes(
  app: Pick<Application, "post">,
  handleController: (fn: (req: Request) => Promise<unknown>) => RequestHandler,
): void {
  const route = (path: string, controller: ControllerFn) => {
    app.post(path, handleController(controller));
  };

  route("/api/a1/analyze", analyzeA1Controller);
  route("/api/a1/create-b2-draft", createB2DraftController);
  route("/api/a1/apply-b2", applyB2Controller);
  route("/api/lark-bug/analyze", analyzeA1Controller);
  route("/api/lark-bug/to-meegle-product-bug/draft", createB2DraftController);
  route("/api/lark-bug/to-meegle-product-bug/apply", applyB2Controller);

  route("/api/a2/analyze", analyzeA2Controller);
  route("/api/a2/create-b1-draft", createB1DraftController);
  route("/api/a2/apply-b1", applyB1Controller);
  route("/api/lark-user-story/analyze", analyzeA2Controller);
  route("/api/lark-user-story/to-meegle-user-story/draft", createB1DraftController);
  route("/api/lark-user-story/to-meegle-user-story/apply", applyB1Controller);
}
