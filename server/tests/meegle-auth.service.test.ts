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
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
          authCode: "auth-code",
          state: "state-1",
        },
        {
          authAdapter: {
            async getPluginToken() {
              return {
                token: "plugin-token",
                expiresInSeconds: 7200,
              };
            },
            async exchangeUserToken() {
              return {
                userToken: "user-token",
                refreshToken: "refresh-token",
                expiresInSeconds: 3600,
                refreshTokenExpiresInSeconds: 1209600,
              };
            },
            async refreshUserToken() {
              return {
                userToken: "refreshed-user-token",
                refreshToken: "refreshed-refresh-token",
                expiresInSeconds: 3600,
                refreshTokenExpiresInSeconds: 1209600,
              };
            },
          },
          tokenStore,
        },
      ),
    ).resolves.toMatchObject({
      tokenStatus: "ready",
      credentialStatus: "active",
      userToken: "user-token",
    });
  });

  it("refreshes a stored token when refresh token exists", async () => {
    const tokenStore = new InMemoryMeegleTokenStore();

    await tokenStore.save({
      masterUserId: "usr_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin-token",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "stale-user-token",
      userTokenExpiresAt: "2020-03-26T10:00:00.000Z",
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      refreshAuthToken(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        {
          authAdapter: {
            async getPluginToken() {
              return {
                token: "plugin-token",
                expiresInSeconds: 7200,
              };
            },
            async exchangeUserToken() {
              return {
                userToken: "user-token",
                refreshToken: "refresh-token",
                expiresInSeconds: 3600,
                refreshTokenExpiresInSeconds: 1209600,
              };
            },
            async refreshUserToken() {
              return {
                userToken: "refreshed-user-token",
                refreshToken: "refreshed-refresh-token",
                expiresInSeconds: 3600,
                refreshTokenExpiresInSeconds: 1209600,
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
          return {
            token: "plugin-token",
            expiresInSeconds: 7200,
          };
        },
        async exchangeUserToken() {
          return {
            userToken: "user-token",
            refreshToken: "refresh-token",
            expiresInSeconds: 3600,
            refreshTokenExpiresInSeconds: 1209600,
          };
        },
        async refreshUserToken() {
          return {
            userToken: "refreshed-user-token",
            refreshToken: "refreshed-refresh-token",
            expiresInSeconds: 3600,
            refreshTokenExpiresInSeconds: 1209600,
          };
        },
      },
      tokenStore,
    });

    await exchangeAuthCode({
      requestId: "req-2",
      masterUserId: "usr_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      authCode: "auth-code",
    });

    await expect(
      refreshAuthToken({
        masterUserId: "usr_xxx",
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
      masterUserId: "usr_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin-token",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "stale-user-token",
      userTokenExpiresAt: "2020-03-26T10:00:00.000Z",
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      refreshAuthToken(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        {
          authAdapter: {
            async getPluginToken() {
              return {
                token: "plugin-token",
                expiresInSeconds: 7200,
              };
            },
            async exchangeUserToken() {
              return {
                userToken: "user-token",
                refreshToken: "refresh-token",
                expiresInSeconds: 3600,
                refreshTokenExpiresInSeconds: 1209600,
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
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toBeUndefined();
  });
});
