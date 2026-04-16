import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createApiRequestLogger } from "./api-request-logger.js";

const { mockInfo, mockWarn, mockError } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      info: mockInfo,
      warn: mockWarn,
      error: mockError,
    }),
  },
}));

describe("api-request-logger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T06:00:00.000Z"));
    mockInfo.mockClear();
    mockWarn.mockClear();
    mockError.mockClear();
  });

  it("logs request start and finish with timestamp and sanitized payload", () => {
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
    expect(mockInfo).toHaveBeenCalledTimes(2);
    expect(mockInfo).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: "START",
        method: "POST",
        path: "/api/lark/auth/status",
        originalUrl: "/api/lark/auth/status",
        body: expect.objectContaining({
          masterUserId: "usr_123",
          baseUrl: "https://open.larksuite.com",
          hasAuthCode: true,
          authCodeSuffix: "1234",
        }),
        query: expect.objectContaining({
          hasAuthCode: false,
        }),
      }),
      "API_REQUEST",
    );
    expect(mockInfo).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: "OK",
        method: "POST",
        path: "/api/lark/auth/status",
        originalUrl: "/api/lark/auth/status",
        statusCode: 200,
        durationMs: 37,
      }),
      "API_REQUEST",
    );
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it("logs 5xx responses as failures", () => {
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

    expect(mockInfo).toHaveBeenCalledOnce();
    expect(mockError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "FAIL",
        method: "GET",
        path: "/api/lark/auth/callback",
        originalUrl: "/api/lark/auth/callback?state=state_123&code=auth_code_9876",
        statusCode: 500,
        query: expect.objectContaining({
          state: "state_123",
          hasAuthCode: true,
          authCodeSuffix: "9876",
        }),
      }),
      "API_REQUEST",
    );
  });
});
