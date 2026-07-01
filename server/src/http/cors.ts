import type { NextFunction, Request, Response } from "express";

export function createCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, master-user-id");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
