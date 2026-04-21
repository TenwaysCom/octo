import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createApiAuthMiddleware } from "./api-auth.js";

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    status,
    json,
  } as unknown as Response;
}

describe("api auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects protected api routes without master-user-id header", () => {
    const middleware = createApiAuthMiddleware();
    const req = {
      method: "POST",
      path: "/api/lark/auth/status",
      body: {
        baseUrl: "https://open.larksuite.com",
      },
      query: {},
      headers: {},
    } as Partial<Request> as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.status as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        errorCode: "UNAUTHORIZED",
        errorMessage: "Missing master-user-id header",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows whitelisted routes without master-user-id header", () => {
    const middleware = createApiAuthMiddleware();
    const req = {
      method: "POST",
      path: "/api/identity/resolve",
      body: {
        operatorLarkId: "ou_123",
      },
      query: {},
      headers: {},
    } as Partial<Request> as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("injects masterUserId from header into protected request bodies", () => {
    const middleware = createApiAuthMiddleware();
    const req = {
      method: "POST",
      path: "/api/lark/auth/status",
      body: {
        baseUrl: "https://open.larksuite.com",
      },
      query: {},
      headers: {
        "master-user-id": "usr_header",
      },
    } as Partial<Request> as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_header",
    });
  });

  it("rejects protected requests when body masterUserId conflicts with header", () => {
    const middleware = createApiAuthMiddleware();
    const req = {
      method: "POST",
      path: "/api/lark/auth/status",
      body: {
        masterUserId: "usr_body",
        baseUrl: "https://open.larksuite.com",
      },
      query: {},
      headers: {
        "master-user-id": "usr_header",
      },
    } as Partial<Request> as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.status as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        errorCode: "UNAUTHORIZED",
        errorMessage: "master-user-id header does not match request masterUserId",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("still protects kimi routes", () => {
    const middleware = createApiAuthMiddleware();
    const req = {
      method: "POST",
      path: "/api/acp/kimi/chat",
      body: {
        operatorLarkId: "ou_123",
        message: "hello",
      },
      query: {},
      headers: {},
    } as Partial<Request> as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
