import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createApiRequestLogger } from "./api-request-logger.js";

describe("api-request-logger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T06:00:00.000Z"));
  });

  it("logs request start and finish with timestamp and sanitized payload", () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const middleware = createApiRequestLogger();
    const req = {
      method: "POST",
      path: "/api/lark/auth/status",
      originalUrl: "/api/lark/auth/status",
      body: {
        masterUserId: "usr_123",
        baseUrl: "https://open.larksuite.com",
        authCode: "auth_code_1234",
      },
      query: {},
    } as Partial<Request> as Request;
    const res = new EventEmitter() as Response & EventEmitter;
    res.statusCode = 200;
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);
    vi.advanceTimersByTime(37);
    res.emit("finish");

    expect(next).toHaveBeenCalledOnce();
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      "[Server][API_REQUEST][START]",
      expect.objectContaining({
        timestamp: "2026-04-01T06:00:00.000Z",
        method: "POST",
        path: "/api/lark/auth/status",
        body: expect.objectContaining({
          masterUserId: "usr_123",
          baseUrl: "https://open.larksuite.com",
          hasAuthCode: true,
          authCodeSuffix: "1234",
        }),
      }),
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      "[Server][API_REQUEST][OK]",
      expect.objectContaining({
        timestamp: "2026-04-01T06:00:00.037Z",
        statusCode: 200,
        durationMs: 37,
      }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs 5xx responses as failures", () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const middleware = createApiRequestLogger();
    const req = {
      method: "GET",
      path: "/api/lark/auth/callback",
      originalUrl: "/api/lark/auth/callback?state=state_123&code=auth_code_9876",
      body: undefined,
      query: {
        state: "state_123",
        code: "auth_code_9876",
      },
    } as Partial<Request> as Request;
    const res = new EventEmitter() as Response & EventEmitter;
    res.statusCode = 500;

    middleware(req, res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(12);
    res.emit("finish");

    expect(infoSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "[Server][API_REQUEST][FAIL]",
      expect.objectContaining({
        timestamp: "2026-04-01T06:00:00.012Z",
        method: "GET",
        path: "/api/lark/auth/callback",
        statusCode: 500,
        query: expect.objectContaining({
          state: "state_123",
          hasAuthCode: true,
          authCodeSuffix: "9876",
        }),
      }),
    );
  });
});
