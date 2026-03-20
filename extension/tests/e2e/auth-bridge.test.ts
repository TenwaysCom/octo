import { describe, expect, it } from "vitest";
import { runAuthBridgeFlow } from "../../src/background/handlers/meegle-auth";

describe("auth bridge e2e", () => {
  it("obtains auth code and returns ready", async () => {
    await expect(
      runAuthBridgeFlow(
        {
          requestId: "req-1",
          operatorLarkId: "ou_xxx",
          baseUrl: "https://project.larksuite.com",
          state: "state-1",
        },
        {
          requestAuthCode: async () => ({
            authCode: "auth-code",
            state: "state-1",
            issuedAt: "2026-03-20T12:00:00+08:00",
          }),
        },
      ),
    ).resolves.toMatchObject({
      status: "ready",
      authCode: "auth-code",
    });
  });

  it("fails when required request metadata is missing", async () => {
    await expect(
      runAuthBridgeFlow(
        {
          requestId: "",
          operatorLarkId: "",
          baseUrl: "https://project.larksuite.com",
          state: "state-1",
        },
        {
          requestAuthCode: async () => ({
            authCode: "auth-code",
            state: "state-1",
            issuedAt: "2026-03-20T12:00:00+08:00",
          }),
        },
      ),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "MEEGLE_AUTH_REQUIRED",
    });
  });
});
