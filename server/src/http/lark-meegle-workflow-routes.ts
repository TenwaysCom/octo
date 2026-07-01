import type { Application, Request, Response, RequestHandler } from "express";

type ControllerFn = (input: unknown) => Promise<unknown>;

export function registerLarkMeegleWorkflowRoutes(
  app: Pick<Application, "post">,
  handleController: (fn: (req: Request) => Promise<unknown>) => RequestHandler,
): void {
  // Legacy A1/A2 routes removed; use /api/lark-base/create-meegle-workitem instead.
}
