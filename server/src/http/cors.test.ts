import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createCorsMiddleware } from "./cors.js";

describe("cors middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds permissive cors headers for api requests", () => {
    const middleware = createCorsMiddleware();
    const req = {
      method: "GET",
    } as Partial<Request> as Request;
    const res = {
      header: vi.fn(),
      status: vi.fn(),
      end: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.header).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
    expect(res.header).toHaveBeenCalledWith("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    expect(res.header).toHaveBeenCalledWith("Access-Control-Allow-Headers", "Content-Type, master-user-id");
    expect(next).toHaveBeenCalledOnce();
  });

  it("short-circuits preflight requests", () => {
    const middleware = createCorsMiddleware();
    const end = vi.fn();
    const status = vi.fn(() => ({ end }));
    const req = {
      method: "OPTIONS",
    } as Partial<Request> as Request;
    const res = {
      header: vi.fn(),
      status,
      end: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(204);
    expect(end).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
