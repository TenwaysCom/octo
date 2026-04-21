import "reflect-metadata";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import { resolveIdentityController } from "./modules/identity/identity.controller.js";
import { writeClientDebugLogController } from "./modules/debug-log/debug-log.controller.js";
import { exchangeAuthCodeController, getAuthStatusController } from "./modules/meegle-auth/meegle-auth.controller.js";
import { exchangeAuthCodeController as exchangeLarkAuthCodeController, refreshTokenController as refreshLarkTokenController, getAuthStatusController as getLarkAuthStatusController, handleAuthCallbackController as handleLarkAuthCallbackController, createOauthSessionController as createLarkOauthSessionController, getLarkUserInfoController as getLarkUserInfoController, refreshLarkAuthStatusController } from "./modules/lark-auth/lark-auth.controller.js";
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
import { acpKimiChatController } from "./modules/acp-kimi/acp-kimi.controller.js";
import {
  acpKimiSessionDeleteController,
  acpKimiSessionListController,
  acpKimiSessionLoadController,
  acpKimiSessionRenameController,
} from "./modules/acp-kimi/acp-kimi-sessions.controller.js";
import {
  getLarkRecordUrlController,
  updateLarkBaseMeegleLinkController,
} from "./modules/lark-base/lark-base.controller.js";
import { createLarkBaseWorkflowController } from "./modules/lark-base/lark-base-workflow.controller.js";
import {
  createLarkBaseBulkWorkflowController,
  previewLarkBaseBulkWorkflowController,
} from "./modules/lark-base/lark-base-bulk-workflow.controller.js";
import { meegleLarkPushController } from "./modules/meegle-workitem/meegle-lark-push.controller.js";
import { createApiRequestLogger } from "./http/api-request-logger.js";
import { createApiAuthMiddleware } from "./http/api-auth.js";
import { prMeegleLookupController } from "./modules/github-pr-lookup/pr-meegle-lookup.controller.js";
import { createCorsMiddleware } from "./http/cors.js";
import { logger } from "./logger.js";

const serverLogger = logger.child({ module: "server" });

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
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED:
    process.env.CLIENT_DEBUG_LOG_UPLOAD_ENABLED === "true",
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
  serverLogger.info({ larkAppId: LARK_APP_ID }, "Lark auth configured");
} else {
  serverLogger.warn("LARK_APP_ID and LARK_APP_SECRET not configured. Lark auth will not work.");
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
  serverLogger.info({ meeglePluginId: MEEGLE_PLUGIN_ID }, "Meegle auth configured");
} else {
  serverLogger.warn("MEEGLE_PLUGIN_ID and MEEGLE_PLUGIN_SECRET not configured. Meegle auth will not work.");
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

function getMasterUserIdHeader(req: Request): string | undefined {
  const headerValue = req.headers["master-user-id"];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

app.use(createCorsMiddleware());
app.use(express.json());
app.use(createApiRequestLogger());
app.use(createApiAuthMiddleware());

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
      serverLogger.error({
        path: req.path,
        method: req.method,
        originalUrl: req.originalUrl,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, "REQUEST_HANDLER_ERROR");
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
app.post("/api/debug/client-log", async (req, res) => {
  try {
    const result = await writeClientDebugLogController({
      ...(req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {}),
      masterUserId: getMasterUserIdHeader(req),
    });
    res.json(result);
  } catch (error) {
    serverLogger.error({
      path: req.path,
      method: req.method,
      originalUrl: req.originalUrl,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, "REQUEST_HANDLER_ERROR");
    res.status(500).json({
      ok: false,
      error: {
        errorCode: "INTERNAL_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

// Public config route
app.get("/api/config/public", async (_req, res) => {
  res.json(await getPublicConfigController());
});

// Meegle auth routes
app.post("/api/meegle/auth/exchange", handleController(exchangeAuthCodeController));
app.post("/api/meegle/auth/status", handleController(getAuthStatusController));

// Lark auth routes
app.post("/api/lark/auth/exchange", handleController(exchangeLarkAuthCodeController));
app.post("/api/lark/auth/refresh", handleController(refreshLarkAuthStatusController));
app.post("/api/lark/auth/status", handleController(getLarkAuthStatusController));
app.post("/api/lark/auth/session", handleController(createLarkOauthSessionController));
app.post("/api/lark/user-info", handleController(getLarkUserInfoController));
app.get("/api/lark/auth/callback", async (req, res) => {
  const result = await handleLarkAuthCallbackController({
    query: req.query,
  });
  res.status(result.statusCode).contentType(result.contentType).send(result.body);
});

registerLarkMeegleWorkflowRoutes(app, handleController);
app.post("/api/acp/kimi/chat", acpKimiChatController);
app.post("/api/acp/kimi/sessions/list", handleController(acpKimiSessionListController));
app.post("/api/acp/kimi/sessions/load", handleController(acpKimiSessionLoadController));
app.post("/api/acp/kimi/sessions/rename", handleController(acpKimiSessionRenameController));
app.post("/api/acp/kimi/sessions/delete", handleController(acpKimiSessionDeleteController));

// PM Analysis routes
app.post("/api/pm/analysis/run", handleController(runPMAnalysisController));

// Lark Base routes
app.post("/api/lark-base/update-meegle-link", handleController(updateLarkBaseMeegleLinkController));
app.post("/api/lark-base/get-record-url", handleController(getLarkRecordUrlController));
app.post("/api/lark-base/create-meegle-workitem", handleController(createLarkBaseWorkflowController));
app.post("/api/lark-base/bulk-preview-meegle-workitems", handleController(previewLarkBaseBulkWorkflowController));
app.post("/api/lark-base/bulk-create-meegle-workitems", handleController(createLarkBaseBulkWorkflowController));

// Meegle workitem routes
app.post("/api/meegle/workitem/update-lark-and-push", handleController(meegleLarkPushController));

// GitHub PR lookup routes
app.post("/api/github/pr/lookup-meegle", handleController(prMeegleLookupController));

if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  await ensureSharedDatabase();
  app.listen(PORT, HOST, () => {
    serverLogger.info(`Tenways Octo Server running on http://${HOST}:${PORT}`);
    serverLogger.info(`Health check: http://${HOST}:${PORT}/health`);
    serverLogger.info(`Lark Base create workitem: http://${HOST}:${PORT}/api/lark-base/create-meegle-workitem`);
  });
}

export default app;
