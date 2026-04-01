import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateMeegleAuthExchangeRequest, validateMeegleAuthStatusRequest } from "./meegle-auth.dto.js";

describe("meegle-auth.dto", () => {
  describe("validateMeegleAuthExchangeRequest", () => {
    it("should validate a valid exchange request", () => {
      const input = {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "code_123",
        state: "state_456",
      };

      const result = validateMeegleAuthExchangeRequest(input);

      expect(result).toEqual(input);
    });

    it("should throw for missing required fields", () => {
      const input = {
        requestId: "req_001",
        // missing masterUserId
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "code_123",
      };

      expect(() => validateMeegleAuthExchangeRequest(input)).toThrow();
    });

    it("should throw for invalid baseUrl", () => {
      const input = {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "not-a-url",
        authCode: "code_123",
      };

      expect(() => validateMeegleAuthExchangeRequest(input)).toThrow();
    });

    it("should accept request without state (optional)", () => {
      const input = {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "code_123",
      };

      const result = validateMeegleAuthExchangeRequest(input);

      expect(result.authCode).toBe("code_123");
      expect(result.state).toBeUndefined();
    });
  });

  describe("validateMeegleAuthStatusRequest", () => {
    it("should validate a valid status request", () => {
      const input = {
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      };

      const result = validateMeegleAuthStatusRequest(input);

      expect(result.masterUserId).toBe("usr_xxx");
      expect(result.meegleUserKey).toBe("user_xxx");
    });

    it("should accept request without baseUrl (optional)", () => {
      const input = {
        masterUserId: "usr_xxx",
      };

      const result = validateMeegleAuthStatusRequest(input);

      expect(result.masterUserId).toBe("usr_xxx");
      expect(result.baseUrl).toBeUndefined();
    });

    it("should accept request without meegleUserKey (optional)", () => {
      const input = {
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
      };

      const result = validateMeegleAuthStatusRequest(input);

      expect(result.masterUserId).toBe("usr_xxx");
      expect(result.meegleUserKey).toBeUndefined();
    });
  });
});
