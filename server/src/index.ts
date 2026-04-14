import "reflect-metadata";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import { resolveIdentityController } from "./modules/identity/identity.controller.js";
import { exchangeAuthCodeController, getAuthStatusController } from "./modules/meegle-auth/meegle-auth.controller.js";
import { exchangeAuthCodeController as exchangeLarkAuthCodeController, refreshTokenController as refreshLarkTokenController, getAuthStatusController as getLarkAuthStatusController, handleAuthCallbackController as handleLarkAuthCallbackController, createOauthSessionController as createLarkOauthSessionController } from "./modules/lark-auth/lark-auth.controller.js";
import { configureLarkAuthControllerDeps } from "./modules/lark-auth/lark-auth.controller.js";
import { configureLarkAuthServiceDeps } from "./modules/lark-auth/lark-auth.service.js";
import { configureMeegleAuthServiceDeps } from "./modules/meegle-auth/meegle-auth.service.js";
import { configurePublicConfigController, getPublicConfigController } from "./modules/public-config/public-config.controller.js";
import { createHttpMeegleAuthAdapter } from "./adapters/meegle/auth-adapter.js";
import { ensureSharedDatabase } from "./adapters/postgres/database.js";
import { getSharedMeegleTokenStore } from "./adapters/postgres/meegle-token-store.js";
import { getSharedLarkTokenStore } from "./adapters/postgres/lark-token-store.js";
import { getSharedOauthSessionStore } from "./adapters/postgres/lark-oauth-session-store.js";
import { registerLarkMeegleWorkflowRoutes } from "./http/lark-meegle-workflow-routes.js";
import { runPMAnalysisController } from "./modules/pm-analysis/pm-analysis.controller.js";
import { updateLarkBaseMeegleLinkController } from "./modules/lark-base/lark-base.controller.js";
import { createLarkBaseWorkflowController } from "./modules/lark-base/lark-base-workflow.controller.js";
import { createApiRequestLogger, logApiRequest, summarizeRequestPayload } from "./http/api-request-logger.js";
import { createCorsMiddleware } from "./http/cors.js";

// Load environment variables
const LARK_APP_ID = process.env.LARK_APP_ID || "";
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || "";
const LARK_OAUTH_CALLBACK_URL = process.env.LARK_OAUTH_CALLBACK_URL || "http://localhost:3000/api/lark/auth/callback";
const MEEGLE_PLUGIN_ID = process.env.MEEGLE_PLUGIN_ID || "";
const MEEGLE_PLUGIN_SECRET = process.env.MEEGLE_PLUGIN_SECRET || "";
const MEEGLE_BASE_URL = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";

configurePublicConfigController({
  MEEGLE_PLUGIN_ID,
  LARK_APP_ID,
  LARK_OAUTH_CALLBACK_URL,
  MEEGLE_BASE_URL,
});

// Configure Lark auth with credentials
if (LARK_APP_ID && LARK_APP_SECRET) {
  configureLarkAuthControllerDeps({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  configureLarkAuthServiceDeps({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
    tokenStore: getSharedLarkTokenStore(),
    oauthSessionStore: getSharedOauthSessionStore(),
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
    tokenStore: getSharedMeegleTokenStore(),
    meegleAuthBaseUrl: MEEGLE_BASE_URL,
  });
  console.log("[Server] Meegle auth configured with PLUGIN_ID:", MEEGLE_PLUGIN_ID);
} else {
  console.warn("[Server] Warning: MEEGLE_PLUGIN_ID and MEEGLE_PLUGIN_SECRET not configured. Meegle auth will not work.");
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

app.use(createCorsMiddleware());
app.use(express.json());
app.use(createApiRequestLogger());

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
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req.body);
      res.json(result);
    } catch (error) {
      logApiRequest("FAIL", {
        path: req.path,
        method: req.method,
        originalUrl: req.originalUrl,
        body: summarizeRequestPayload(req.body),
        query: summarizeRequestPayload(req.query),
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, "error");
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
app.post("/api/lark/auth/session", handleController(createLarkOauthSessionController));
app.get("/api/lark/auth/callback", async (req, res) => {
  const result = await handleLarkAuthCallbackController({
    query: req.query,
  });
  res.status(result.statusCode).contentType(result.contentType).send(result.body);
});

registerLarkMeegleWorkflowRoutes(app, handleController);

// PM Analysis routes
app.post("/api/pm/analysis/run", handleController(runPMAnalysisController));

// Lark Base routes
app.post("/api/lark-base/update-meegle-link", handleController(updateLarkBaseMeegleLinkController));
app.post("/api/lark-base/create-meegle-workitem", handleController(createLarkBaseWorkflowController));

if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  await ensureSharedDatabase();
  app.listen(PORT, HOST, () => {
    console.log(`Tenways Octo Server running on http://${HOST}:${PORT}`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
    console.log(`Lark Base create workitem: http://${HOST}:${PORT}/api/lark-base/create-meegle-workitem`);
  });
}

export default app;
