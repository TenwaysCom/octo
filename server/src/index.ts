import "reflect-metadata";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import { analyzeA2Controller, createB1DraftController, applyB1Controller } from "./modules/a2/a2.controller.js";
import { analyzeA1Controller, createB2DraftController, applyB2Controller } from "./modules/a1/a1.controller.js";
import { resolveIdentityController } from "./modules/identity/identity.controller.js";
import { exchangeAuthCodeController, getAuthStatusController } from "./modules/meegle-auth/meegle-auth.controller.js";
import { exchangeAuthCodeController as exchangeLarkAuthCodeController, refreshTokenController as refreshLarkTokenController, getAuthStatusController as getLarkAuthStatusController } from "./modules/lark-auth/lark-auth.controller.js";
import { configureLarkAuthControllerDeps } from "./modules/lark-auth/lark-auth.controller.js";
import { configureMeegleAuthServiceDeps } from "./modules/meegle-auth/meegle-auth.service.js";
import { configurePublicConfigController, getPublicConfigController } from "./modules/public-config/public-config.controller.js";
import { createHttpMeegleAuthAdapter } from "./adapters/meegle/auth-adapter.js";
import { sharedMeegleTokenStore } from "./adapters/sqlite/meegle-token-store.js";
import { runPMAnalysisController } from "./modules/pm-analysis/pm-analysis.controller.js";

// Load environment variables
const LARK_APP_ID = process.env.LARK_APP_ID || "";
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || "";
const MEEGLE_PLUGIN_ID = process.env.MEEGLE_PLUGIN_ID || "";
const MEEGLE_PLUGIN_SECRET = process.env.MEEGLE_PLUGIN_SECRET || "";
const MEEGLE_BASE_URL = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";

configurePublicConfigController({
  MEEGLE_PLUGIN_ID,
  LARK_APP_ID,
  MEEGLE_BASE_URL,
});

// Configure Lark auth with credentials
if (LARK_APP_ID && LARK_APP_SECRET) {
  configureLarkAuthControllerDeps({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  console.log("[Server] Lark auth configured with APP_ID:", LARK_APP_ID);
} else {
  console.warn("[Server] Warning: LARK_APP_ID and LARK_APP_SECRET not configured. Lark auth will not work.");
}

// Configure Meegle auth with credentials
if (MEEGLE_PLUGIN_ID && MEEGLE_PLUGIN_SECRET) {
  const meegleAuthAdapter = createHttpMeegleAuthAdapter({
    pluginId: MEEGLE_PLUGIN_ID,
    pluginSecret: MEEGLE_PLUGIN_SECRET,
  });
  configureMeegleAuthServiceDeps({
    authAdapter: meegleAuthAdapter,
    pluginId: MEEGLE_PLUGIN_ID,
    tokenStore: sharedMeegleTokenStore,
  });
  console.log("[Server] Meegle auth configured with PLUGIN_ID:", MEEGLE_PLUGIN_ID);
} else {
  console.warn("[Server] Warning: MEEGLE_PLUGIN_ID and MEEGLE_PLUGIN_SECRET not configured. Meegle auth will not work.");
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "tenways-octo-server",
  });
});

// Error handler wrapper
function handleController(fn: (req: Request) => Promise<unknown>) {
  function summarizeBody(body: unknown): unknown {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return body;
    }

    const record = body as Record<string, unknown>;
    return {
      requestId: record.requestId,
      operatorLarkId: record.operatorLarkId,
      meegleUserKey: record.meegleUserKey,
      baseUrl: record.baseUrl,
      state: record.state,
      hasAuthCode: typeof record.authCode === "string" && record.authCode.length > 0,
      authCodeSuffix:
        typeof record.authCode === "string" && record.authCode.length > 4
          ? record.authCode.slice(-4)
          : undefined,
      hasCookie: typeof record.cookie === "string" && record.cookie.length > 0,
    };
  }

  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req.body);
      res.json(result);
    } catch (error) {
      console.error("Controller error:", {
        path: req.path,
        method: req.method,
        body: summarizeBody(req.body),
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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

// Public config route
app.get("/api/config/public", async (_req, res) => {
  res.json(await getPublicConfigController());
});

// Meegle auth routes
app.post("/api/meegle/auth/exchange", handleController(exchangeAuthCodeController));
app.post("/api/meegle/auth/status", handleController(getAuthStatusController));

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
  console.log(`Tenways Octo Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`A2 analyze: http://localhost:${PORT}/api/a2/analyze`);
  console.log(`A2 create draft: http://localhost:${PORT}/api/a2/create-b1-draft`);
  console.log(`A2 apply: http://localhost:${PORT}/api/a2/apply-b1`);
});

export default app;
