import { Router } from "express";
import { GitHubClient } from "../adapters/github/github-client.js";
import { GitHubReverseLookupController } from "../controllers/github-reverse-lookup.js";
import type { MeegleClient } from "../adapters/meegle/meegle-client.js";

export interface GitHubLookupRouteOptions {
  meegleClient: MeegleClient;
  githubToken: string;
}

export function createGitHubLookupRouter(options: GitHubLookupRouteOptions): Router {
  const router = Router();
  const githubClient = new GitHubClient({ token: options.githubToken });
  const controller = new GitHubReverseLookupController(githubClient, options.meegleClient);

  router.post("/lookup-meegle", async (req, res, next) => {
    try {
      const { prUrl } = req.body;

      if (!prUrl || typeof prUrl !== "string") {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_REQUEST", message: "prUrl is required" },
        });
      }

      const result = await controller.lookup(prUrl);
      res.json({ success: true, data: result });
    } catch (error) {
      const err = error as Error & { code?: string; status?: number };
      const code = err.code ?? "UNKNOWN_ERROR";
      const status = err.status ?? (code === "NO_MEEGLE_ID_FOUND" ? 404 : 500);

      res.status(status).json({
        success: false,
        error: { code, message: err.message },
      });
    }
  });

  return router;
}
