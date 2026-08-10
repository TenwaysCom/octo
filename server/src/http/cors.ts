import type { NextFunction, Request, Response } from "express";

export function parseAllowedCredentialOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return Array.from(new Set(value.split(",").map((item) => {
    const configuredOrigin = item.trim();
    const url = new URL(configuredOrigin);
    if (
      url.protocol === "chrome-extension:"
      && /^[a-p]{32}$/.test(url.hostname)
      && (url.pathname === "" || url.pathname === "/")
      && !url.search
      && !url.hash
    ) {
      return `chrome-extension://${url.hostname}`;
    }
    if (url.origin === "null") {
      throw new Error("Allowed credential origins must be explicit HTTP(S) or Chrome extension origins");
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Allowed credential origins must not include a path, query, or hash");
    }
    return url.origin;
  })));
}

export function createCorsMiddleware(options: { allowedCredentialOrigins?: readonly string[] } = {}) {
  const allowedCredentialOrigins = new Set(options.allowedCredentialOrigins ?? []);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers?.origin;
    const requestOrigin = typeof origin === "string" ? origin : undefined;
    if (requestOrigin && allowedCredentialOrigins.has(requestOrigin)) {
      res.header("Access-Control-Allow-Origin", requestOrigin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Vary", "Origin");
    } else {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, master-user-id");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
