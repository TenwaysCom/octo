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
  apiLogger: {
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
      headers: {
        "master-user-id": "usr_header_123",
      },
      body: {
        masterUserId: "usr_123",
        baseUrl: "https://open.larksuite.com",
        authCode: "auth_code_1234",
      },
      query: {},
    } as Partial<Request> as Request;
    const res = new EventEmitter() as Response & EventEmitter;
    res.statusCode = 200;
    res.json = vi.fn((body: unknown) => body) as unknown as Response["json"];
    res.send = vi.fn((body: unknown) => body) as unknown as Response["send"];
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);
    res.json({
      ok: true,
      data: {
        status: "ready",
        accessToken: "token-secret",
      },
    });
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
        headerMasterUserId: "usr_header_123",
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
        headerMasterUserId: "usr_header_123",
        responseBody: {
          ok: true,
          data: {
            status: "ready",
            hasAccessToken: true,
          },
        },
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
      headers: {},
      body: undefined,
      query: {
        state: "state_123",
        code: "auth_code_9876",
      },
    } as Partial<Request> as Request;
    const res = new EventEmitter() as Response & EventEmitter;
    res.statusCode = 500;
    res.json = vi.fn((body: unknown) => body) as unknown as Response["json"];
    res.send = vi.fn((body: unknown) => body) as unknown as Response["send"];

    middleware(req, res, vi.fn() as unknown as NextFunction);
    res.json({
      ok: false,
      error: {
        errorCode: "INTERNAL_ERROR",
        errorMessage: "boom",
      },
    });
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
        responseBody: {
          ok: false,
          error: {
            errorCode: "INTERNAL_ERROR",
            errorMessage: "boom",
          },
        },
      }),
      "API_REQUEST",
    );
  });
});
