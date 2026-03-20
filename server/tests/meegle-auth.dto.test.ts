import { describe, expect, it } from "vitest";
import { validateMeegleAuthExchangeRequest } from "../src/modules/meegle-auth/meegle-auth.dto";

describe("validateMeegleAuthExchangeRequest", () => {
  it("rejects a request without authCode", () => {
    expect(() =>
      validateMeegleAuthExchangeRequest({
        requestId: "req-1",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).toThrow();
  });
});
