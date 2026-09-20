import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { exchangeWeKnoraEmbedToken } from "../../adapters/weknora/embed-token.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";

function readSession(cookieHeader: string | undefined) {
  const prefix = `${WEB_SESSION_COOKIE_NAME}=`;
  const cookie = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  try { return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined; }
  catch { return undefined; }
}

export function createWeKnoraController(deps: {
  resolveSession?: typeof resolveLarkWebSessionIdentity;
  exchange?: typeof exchangeWeKnoraEmbedToken;
  env?: NodeJS.ProcessEnv;
} = {}) {
  return async (input: { cookieHeader?: string; query: unknown }) => {
    const actionRunId = randomUUID();
    const fail = (statusCode: number, errorCode: string, stage: string) => ({
      statusCode,
      body: { ok: false, error: { errorCode, errorMessage: errorCode, actionRunId,
        layer: stage === "exchange" ? "adapter" : "server", module: "weknora", stage } },
    });
    try {
      const session = await (deps.resolveSession ?? resolveLarkWebSessionIdentity)(readSession(input.cookieHeader));
      if (!session.ok) return fail(401, "UNAUTHORIZED", "auth");
      if (!z.object({}).strict().safeParse(input.query).success) return fail(400, "INVALID_REQUEST", "validation");
      const env = deps.env ?? process.env;
      const publishToken = env.WEKNORA_PUBLISH_TOKEN?.trim();
      let origin: string;
      try {
        const url = new URL(env.WEKNORA_EMBED_ORIGIN || env.LARK_OAUTH_CALLBACK_URL || "");
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid origin");
        origin = url.origin;
      } catch { return fail(503, "WEKNORA_NOT_CONFIGURED", "config"); }
      if (!publishToken) return fail(503, "WEKNORA_NOT_CONFIGURED", "config");
      try {
        const data = await (deps.exchange ?? exchangeWeKnoraEmbedToken)({ publishToken, origin });
        // The widget expects this flat token contract.
        return { statusCode: 200, body: data };
      } catch { return fail(502, "WEKNORA_MINT_FAILED", "exchange"); }
    } catch { return fail(500, "WEKNORA_SESSION_CHECK_FAILED", "auth"); }
  };
}

export function registerWeKnoraRoutes(app: Express, deps: Parameters<typeof createWeKnoraController>[0] = {}) {
  const controller = createWeKnoraController(deps);
  for (const path of ["/weknora/embed-token", "/api/weknora/embed-token"]) {
    app.get(path, async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const result = await controller({ cookieHeader: req.headers.cookie, query: req.query });
      res.status(result.statusCode).json(result.body);
    });
  }
}
