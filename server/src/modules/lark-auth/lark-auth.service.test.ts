import { describe, expect, it, vi } from "vitest";
import {
  exchangeLarkAuthCode,
  refreshLarkToken,
} from "./lark-auth.service.js";

describe("lark-auth.service", () => {
  it("normalizes lark page aliases to the canonical auth base during exchange", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          app_access_token: "app_access_token_123",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            access_token: "user_access_token_456",
            refresh_token: "refresh_token_789",
            expires_in: 7200,
            token_type: "Bearer",
          },
        }),
      });

    const result = await exchangeLarkAuthCode(
      {
        operatorLarkId: "ou_xxx",
        baseUrl: "https://foo.feishu.cn",
        code: "auth_code_123",
        grantType: "authorization_code",
      },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://open.larksuite.com/open-apis/auth/v3/app_access_token",
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://open.larksuite.com/open-apis/authen/v1/access_token",
      expect.any(Object),
    );
    expect(result).toMatchObject({
      accessToken: "user_access_token_456",
      refreshToken: "refresh_token_789",
      tokenType: "Bearer",
    });
  });

  it("normalizes lark page aliases to the canonical auth base during refresh", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          app_access_token: "app_access_token_123",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            access_token: "user_access_token_456",
            refresh_token: "refresh_token_789",
            expires_in: 7200,
            token_type: "Bearer",
          },
        }),
      });

    const result = await refreshLarkToken(
      {
        operatorLarkId: "ou_xxx",
        baseUrl: "https://www.larksuite.com",
        refreshToken: "refresh_token_123",
      },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://open.larksuite.com/open-apis/auth/v3/app_access_token",
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://open.larksuite.com/open-apis/authen/v1/refresh_access_token",
      expect.any(Object),
    );
    expect(result).toMatchObject({
      accessToken: "user_access_token_456",
      refreshToken: "refresh_token_789",
      tokenType: "Bearer",
    });
  });
});
