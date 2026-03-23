import "reflect-metadata";
import express, { type Request, type Response } from "express";
import { analyzeA2Controller, createB1DraftController, applyB1Controller } from "./modules/a2/a2.controller.js";
import { analyzeA1Controller, createB2DraftController, applyB2Controller } from "./modules/a1/a1.controller.js";
import { resolveIdentityController } from "./modules/identity/identity.controller.js";
import { exchangeAuthCodeController, getAuthStatusController, getAuthCodeController } from "./modules/meegle-auth/meegle-auth.controller.js";
import { exchangeAuthCodeController as exchangeLarkAuthCodeController, refreshTokenController as refreshLarkTokenController, getAuthStatusController as getLarkAuthStatusController } from "./modules/lark-auth/lark-auth.controller.js";
import { runPMAnalysisController } from "./modules/pm-analysis/pm-analysis.controller.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "it-pm-assistant-server",
  });
});

// Error handler wrapper
function handleController(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req);
      res.json(result);
    } catch (error) {
      console.error("Controller error:", error);
      res.status(500).json({
        ok: false,
        error: {
          errorCode: "INTERNAL_ERROR",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };
}

// Identity routes
app.post("/api/identity/resolve", handleController(resolveIdentityController));

// Meegle auth routes
app.post("/api/meegle/auth/exchange", handleController(exchangeAuthCodeController));
app.post("/api/meegle/auth/status", handleController(getAuthStatusController));
app.post("/api/meegle/auth/get-code", handleController(getAuthCodeController));

// Lark auth routes
app.post("/api/lark/auth/exchange", handleController(exchangeLarkAuthCodeController));
app.post("/api/lark/auth/refresh", handleController(refreshLarkTokenController));
app.post("/api/lark/auth/status", handleController(getLarkAuthStatusController));

// A1 routes
app.post("/api/a1/analyze", handleController(analyzeA1Controller));
app.post("/api/a1/create-b2-draft", handleController(createB2DraftController));
app.post("/api/a1/apply-b2", handleController(applyB2Controller));

// A2 routes
app.post("/api/a2/analyze", handleController(analyzeA2Controller));
app.post("/api/a2/create-b1-draft", handleController(createB1DraftController));
app.post("/api/a2/apply-b1", handleController(applyB1Controller));

// PM Analysis routes
app.post("/api/pm/analysis/run", handleController(runPMAnalysisController));

app.listen(PORT, () => {
  console.log(`IT PM Assistant Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`A2 analyze: http://localhost:${PORT}/api/a2/analyze`);
  console.log(`A2 create draft: http://localhost:${PORT}/api/a2/create-b1-draft`);
  console.log(`A2 apply: http://localhost:${PORT}/api/a2/apply-b1`);
});

export default app;
