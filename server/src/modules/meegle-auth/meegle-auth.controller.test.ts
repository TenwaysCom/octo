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
      userToken: "user_token_456",
      refreshToken: "refresh_token_789",
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
      userToken: "user_token_456",
      refreshToken: "refresh_token_789",
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
        reason: "Stored Meegle token is available",
      },
    });
  });
});
