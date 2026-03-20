import { describe, expect, it } from "vitest";
import { InMemoryMeegleTokenStore } from "../src/adapters/meegle/token-store";
import {
  configureMeegleAuthServiceDeps,
  exchangeAuthCode,
  refreshAuthToken,
} from "../src/modules/meegle-auth/meegle-auth.service";

describe("exchangeAuthCode", () => {
  it("returns ready when plugin token and auth code exchange succeeds", async () => {
    const tokenStore = new InMemoryMeegleTokenStore();

    await expect(
      exchangeAuthCode(
        {
          requestId: "req-1",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
          authCode: "auth-code",
          state: "state-1",
        },
        {
          authAdapter: {
            async getPluginToken() {
              return "plugin-token";
            },
            async exchangeUserToken() {
              return {
                userToken: "user-token",
                refreshToken: "refresh-token",
              };
            },
            async refreshUserToken() {
              return {
                userToken: "refreshed-user-token",
                refreshToken: "refreshed-refresh-token",
              };
            },
          },
          tokenStore,
        },
      ),
    ).resolves.toMatchObject({ tokenStatus: "ready", userToken: "user-token" });
  });

  it("refreshes a stored token when refresh token exists", async () => {
    const tokenStore = new InMemoryMeegleTokenStore();

    await tokenStore.save({
      operatorLarkId: "ou_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin-token",
      userToken: "stale-user-token",
      refreshToken: "refresh-token",
    });

    await expect(
      refreshAuthToken(
        {
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        {
          authAdapter: {
            async getPluginToken() {
              return "plugin-token";
            },
            async exchangeUserToken() {
              return {
                userToken: "user-token",
                refreshToken: "refresh-token",
              };
            },
            async refreshUserToken() {
              return {
                userToken: "refreshed-user-token",
                refreshToken: "refreshed-refresh-token",
              };
            },
          },
          tokenStore,
        },
      ),
    ).resolves.toMatchObject({
      tokenStatus: "ready",
      userToken: "refreshed-user-token",
    });
  });

  it("reuses configured store across exchange and refresh calls", async () => {
    const tokenStore = new InMemoryMeegleTokenStore();
    configureMeegleAuthServiceDeps({
      authAdapter: {
        async getPluginToken() {
          return "plugin-token";
        },
        async exchangeUserToken() {
          return {
            userToken: "user-token",
            refreshToken: "refresh-token",
          };
        },
        async refreshUserToken() {
          return {
            userToken: "refreshed-user-token",
            refreshToken: "refreshed-refresh-token",
          };
        },
      },
      tokenStore,
    });

    await exchangeAuthCode({
      requestId: "req-2",
      operatorLarkId: "ou_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      authCode: "auth-code",
    });

    await expect(
      refreshAuthToken({
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toMatchObject({
      tokenStatus: "ready",
      userToken: "refreshed-user-token",
    });
  });

  it("returns require_auth_code when refresh fails", async () => {
    const tokenStore = new InMemoryMeegleTokenStore();

    await tokenStore.save({
      operatorLarkId: "ou_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin-token",
      userToken: "stale-user-token",
      refreshToken: "refresh-token",
    });

    await expect(
      refreshAuthToken(
        {
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        {
          authAdapter: {
            async getPluginToken() {
              return "plugin-token";
            },
            async exchangeUserToken() {
              return {
                userToken: "user-token",
                refreshToken: "refresh-token",
              };
            },
            async refreshUserToken() {
              throw new Error("refresh failed");
            },
          },
          tokenStore,
        },
      ),
    ).resolves.toMatchObject({
      tokenStatus: "require_auth_code",
    });

    await expect(
      tokenStore.get({
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toBeUndefined();
  });
});
