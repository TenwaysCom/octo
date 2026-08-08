import "reflect-metadata";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import { resolveIdentityController } from "./modules/identity/identity.controller.js";
import { writeClientDebugLogController } from "./modules/debug-log/debug-log.controller.js";
import { exchangeAuthCodeController, getAuthStatusController } from "./modules/meegle-auth/meegle-auth.controller.js";
import { exchangeAuthCodeController as exchangeLarkAuthCodeController, refreshTokenController as refreshLarkTokenController, getAuthStatusController as getLarkAuthStatusController, handleAuthCallbackController as handleLarkAuthCallbackController, createOauthSessionController as createLarkOauthSessionController, ensureWebLarkAuthController, getWebProfileController, getLarkUserInfoController as getLarkUserInfoController, logoutWebLarkAuthController, refreshLarkAuthStatusController, startWebLarkAuthController, WEB_SESSION_COOKIE_NAME } from "./modules/lark-auth/lark-auth.controller.js";
import { configureLarkAuthControllerDeps } from "./modules/lark-auth/lark-auth.controller.js";
import { configureLarkAuthServiceDeps } from "./modules/lark-auth/lark-auth.service.js";
import { configureMeegleAuthServiceDeps } from "./modules/meegle-auth/meegle-auth.service.js";
import {
  configurePublicConfigController,
  getExtensionPageConfigController,
  getPublicConfigController,
  getServerApiCatalogController,
} from "./modules/public-config/public-config.controller.js";
import { getExtensionVersionController } from "./modules/public-config/extension-version.controller.js";
import { createHttpMeegleAuthAdapter } from "./adapters/meegle/auth-adapter.js";
import { ensureSharedDatabase } from "./adapters/postgres/database.js";
import { getSharedMeegleTokenStore } from "./adapters/postgres/meegle-token-store.js";
import { getSharedLarkTokenStore } from "./adapters/postgres/lark-token-store.js";
import { getSharedOauthSessionStore } from "./adapters/postgres/lark-oauth-session-store.js";
import { getSharedWebSessionStore } from "./adapters/postgres/web-session-store.js";
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
import { larkBugAnalyzeController } from "./modules/lark-bug/lark-bug-analyze.controller.js";
import { meegleStoryPrdToSimplifiedController } from "./modules/meegle-workitem/meegle-story-prd-to-simplified.controller.js";
import { createApiRequestLogger } from "./http/api-request-logger.js";
import { createApiAuthMiddleware } from "./http/api-auth.js";
import {
  githubBranchPreviewController,
  githubBranchCreateController,
} from "./modules/github-branch-create/github-branch-create.controller.js";
import {
  githubPrReviewController,
  githubPrCodeReviewFeedbackController,
  githubPrReviewStatusController,
} from "./modules/github-pr-review/github-pr-review.controller.js";
import { createCorsMiddleware } from "./http/cors.js";
import { createGitHubLookupRouter } from "./routes/github-lookup.js";
import { SERVER_VERSION } from "./server-version.js";

import { logger, stdoutLogger } from "./logger.js";

const serverLogger = logger.child({ module: "server" });
const stdoutServerLogger = stdoutLogger.child({ module: "server" });

// Load environment variables
const LARK_APP_ID = process.env.LARK_APP_ID || "";
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || "";
const LARK_OAUTH_CALLBACK_URL = process.env.LARK_OAUTH_CALLBACK_URL || "http://localhost:3000/api/lark/auth/callback";
const LARK_WEB_APP_URL = process.env.LARK_WEB_APP_URL || "http://localhost:4173";
const LARK_AUTH_BASE_URL = process.env.LARK_AUTH_BASE_URL || "https://open.larksuite.com";
const LARK_OAUTH_SCOPE = process.env.LARK_OAUTH_SCOPE || "offline_access contact:user.base:readonly bitable:app base:record:retrieve im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message";
const MEEGLE_PLUGIN_ID = process.env.MEEGLE_PLUGIN_ID || "";
const MEEGLE_PLUGIN_SECRET = process.env.MEEGLE_PLUGIN_SECRET || "";
const MEEGLE_BASE_URL = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";

configurePublicConfigController({
  MEEGLE_PLUGIN_ID,
  LARK_APP_ID,
  LARK_OAUTH_CALLBACK_URL,
  LARK_OAUTH_SCOPE,
  MEEGLE_BASE_URL,
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED:
    process.env.CLIENT_DEBUG_LOG_UPLOAD_ENABLED === "true",
});

// Configure Lark auth with credentials
if (LARK_APP_ID && LARK_APP_SECRET) {
  configureLarkAuthControllerDeps({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
    oauthCallbackUrl: LARK_OAUTH_CALLBACK_URL,
    webAppUrl: LARK_WEB_APP_URL,
    oauthBaseUrl: LARK_AUTH_BASE_URL,
    oauthScope: LARK_OAUTH_SCOPE,
  });
  configureLarkAuthServiceDeps({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
    tokenStore: getSharedLarkTokenStore(),
    oauthSessionStore: getSharedOauthSessionStore(),
    webSessionStore: getSharedWebSessionStore(),
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
const WEB_ALLOWED_ORIGINS = (process.env.OCTO_WEB_ALLOWED_ORIGINS || LARK_WEB_APP_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function getMasterUserIdHeader(req: Request): string | undefined {
  const headerValue = req.headers["master-user-id"];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

app.use(createCorsMiddleware({ allowedCredentialOrigins: WEB_ALLOWED_ORIGINS }));
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
app.get("/api/config/page", async (req, res) => {
  res.json(await getExtensionPageConfigController({
    url: typeof req.query.url === "string" ? req.query.url : undefined,
  }));
});
app.get("/api/config/server-api-catalog", async (_req, res) => {
  res.json(await getServerApiCatalogController());
});
app.get("/api/extension/version", async (_req, res) => {
  res.json(await getExtensionVersionController(undefined));
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
app.get("/api/lark/auth/web/start", async (_req, res) => {
  const result = await startWebLarkAuthController();
  res.redirect(302, result.redirectUrl);
});
app.get("/api/lark/auth/web/ensure", async (req, res) => {
  const result = await ensureWebLarkAuthController(req.headers.cookie);
  res.status(result.statusCode).json(result.body);
});
app.get("/api/web/profile", async (req, res) => {
  const result = await getWebProfileController(req.headers.cookie);
  res.status(result.statusCode).json(result.body);
});
app.post("/api/lark/auth/web/logout", async (req, res) => {
  const result = await logoutWebLarkAuthController(req.headers.cookie);
  const secure = LARK_OAUTH_CALLBACK_URL.startsWith("https://");
  res.setHeader("Set-Cookie", [
    `${WEB_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; "));
  res.json(result);
});
app.get("/api/lark/auth/callback", async (req, res) => {
  const result = await handleLarkAuthCallbackController({
    query: req.query,
  });
  if ("redirectUrl" in result && "webSessionToken" in result) {
    const secure = LARK_OAUTH_CALLBACK_URL.startsWith("https://");
    res.setHeader("Set-Cookie", [
      `${WEB_SESSION_COOKIE_NAME}=${encodeURIComponent(result.webSessionToken)}`,
      "Path=/",
      "Max-Age=2592000",
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : "",
    ].filter(Boolean).join("; "));
    res.redirect(302, result.redirectUrl);
    return;
  }
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
app.post("/api/meegle/workitem/story-prd-to-simplified", handleController(meegleStoryPrdToSimplifiedController));

// Lark Bug routes
app.post("/api/lark-bug/analyze", handleController(larkBugAnalyzeController));

// GitHub branch create routes
app.post("/api/github/branch/preview", handleController(githubBranchPreviewController));
app.post("/api/github/branch/create", handleController(githubBranchCreateController));
app.post("/api/github/pr/review", async (req, res) => {
  const result = await githubPrReviewController(req.body);
  res.status(result.ok && result.data.status === "queued" ? 202 : 200).json(result);
});
app.post("/api/github/pr/code-review-feedback", async (req, res) => {
  const result = await githubPrCodeReviewFeedbackController(req.body);
  res.status(result.ok && result.data.status === "queued" ? 202 : 200).json(result);
});
app.get("/api/github/pr/review/:actionRunId", async (req, res) => {
  const result = await githubPrReviewStatusController({
    actionRunId: req.params.actionRunId,
    masterUserId: getMasterUserIdHeader(req),
  });
  res.json(result);
});
app.get("/api/github/pr/code-review-feedback/:actionRunId", async (req, res) => {
  const result = await githubPrReviewStatusController({
    actionRunId: req.params.actionRunId,
    masterUserId: getMasterUserIdHeader(req),
  });
  res.json(result);
});

// GitHub reverse lookup routes (requires GITHUB_TOKEN)
if (process.env.GITHUB_TOKEN) {
  app.use("/api/github", createGitHubLookupRouter({
    githubToken: process.env.GITHUB_TOKEN,
  }));
  serverLogger.info("GitHub reverse lookup route registered");
}

if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  await ensureSharedDatabase();
  app.listen(PORT, HOST, () => {
    const startupLog = { host: HOST, port: PORT, version: SERVER_VERSION };
    serverLogger.info(startupLog, "Tenways Octo Server running");
    stdoutServerLogger.info(startupLog, "Tenways Octo Server running");
    serverLogger.info(`Health check: http://${HOST}:${PORT}/health`);
    serverLogger.info(`Lark Base create workitem: http://${HOST}:${PORT}/api/lark-base/create-meegle-workitem`);
  });
}

export default app;
