import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryMeegleTokenStore } from "../../adapters/meegle/token-store.js";
import { SqliteIdentityStore } from "../../adapters/sqlite/identity-store.js";
import { createSqliteDatabase } from "../../adapters/sqlite/database.js";
import { configureMeegleAuthServiceDeps } from "./meegle-auth.service.js";
import { getAuthStatusController } from "./meegle-auth.controller.js";

describe("meegle-auth.controller", () => {
  let tokenStore: InMemoryMeegleTokenStore;
  let identityStore: SqliteIdentityStore;

  beforeEach(() => {
    tokenStore = new InMemoryMeegleTokenStore();
    identityStore = new SqliteIdentityStore(createSqliteDatabase(":memory:"));
    configureMeegleAuthServiceDeps({
      authAdapter: {
        getPluginToken: vi.fn(),
        exchangeUserToken: vi.fn(),
        refreshUserToken: vi.fn(),
      },
      tokenStore,
      identityStore,
      pluginId: "MII_TEST_PLUGIN",
    });
  });

  it("returns ready when a stored token exists for the current user", async () => {
    await tokenStore.save({
      operatorLarkId: "ou_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "user_token_456",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      getAuthStatusController({
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "ready",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        credentialStatus: "active",
        expiresAt: "2099-03-26T10:30:00.000Z",
        reason: "Stored Meegle token is available",
      },
    });
  });

  it("returns require_auth_code when no stored token exists", async () => {
    await expect(
      getAuthStatusController({
        operatorLarkId: "ou_missing",
        meegleUserKey: "user_missing",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "require_auth_code",
        operatorLarkId: "ou_missing",
        meegleUserKey: "user_missing",
        baseUrl: "https://project.larksuite.com",
        reason: "No stored Meegle token found",
      },
    });
  });

  it("returns ready even when the request baseUrl comes from a different page origin", async () => {
    await tokenStore.save({
      operatorLarkId: "ou_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "user_token_456",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      getAuthStatusController({
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://meegle.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "ready",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        credentialStatus: "active",
        expiresAt: "2099-03-26T10:30:00.000Z",
        reason: "Stored Meegle token is available",
      },
    });
  });

  it("resolves meegleUserKey from stored identity when status is checked from a Lark page", async () => {
    await identityStore.save({
      larkId: "ou_xxx",
      meegleUserKey: "user_xxx",
    });
    await tokenStore.save({
      operatorLarkId: "ou_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "user_token_456",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      getAuthStatusController({
        operatorLarkId: "ou_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "ready",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        credentialStatus: "active",
        expiresAt: "2099-03-26T10:30:00.000Z",
        reason: "Stored Meegle token is available",
      },
    });
  });
});
