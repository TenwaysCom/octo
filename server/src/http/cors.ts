import type { NextFunction, Request, Response } from "express";

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
