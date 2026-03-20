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
          requestAuthCode: async () => "auth-code",
        },
      ),
    ).resolves.toMatchObject({
      status: "ready",
      authCode: "auth-code",
    });
  });
});
