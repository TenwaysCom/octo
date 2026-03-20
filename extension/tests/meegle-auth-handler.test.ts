import { describe, expect, it } from "vitest";
import { ensureMeegleAuth } from "../src/background/handlers/meegle-auth";

describe("ensureMeegleAuth", () => {
  it("returns require_auth_code when no reusable token exists", async () => {
    await expect(
      ensureMeegleAuth({
        requestId: "req-1",
        operatorLarkId: "ou_xxx",
        baseUrl: "https://project.larksuite.com",
        state: "state-1",
      }),
    ).resolves.toMatchObject({
      status: "require_auth_code",
    });
  });

  it("fails when auth bridge state does not match", async () => {
    await expect(
      ensureMeegleAuth(
        {
          requestId: "req-1",
          operatorLarkId: "ou_xxx",
          baseUrl: "https://project.larksuite.com",
          state: "state-1",
        },
        {
          requestAuthCode: async () => ({
            authCode: "auth-code",
            state: "different-state",
            issuedAt: "2026-03-20T12:00:00+08:00",
          }),
        },
      ),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "MEEGLE_AUTH_CODE_STATE_MISMATCH",
    });
  });
});
