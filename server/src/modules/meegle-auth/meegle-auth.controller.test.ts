import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryMeegleTokenStore } from "../../adapters/meegle/token-store.js";
import { configureMeegleAuthServiceDeps } from "./meegle-auth.service.js";
import {
  PostgresResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import {
  exchangeAuthCodeController,
  getAuthStatusController,
} from "./meegle-auth.controller.js";

describe("meegle-auth.controller", () => {
  let tokenStore: InMemoryMeegleTokenStore;
  let resolvedUserStore: PostgresResolvedUserStore;

  beforeEach(async () => {
    tokenStore = new InMemoryMeegleTokenStore();
    const { db } = await createTestPostgresDatabase();
    resolvedUserStore = new PostgresResolvedUserStore(db);
    configureResolvedUserStore(resolvedUserStore);
    configureMeegleAuthServiceDeps({
      authAdapter: {
        getPluginToken: vi.fn(),
        exchangeUserToken: vi.fn(),
        refreshUserToken: vi.fn(),
      },
      tokenStore,
      pluginId: "MII_TEST_PLUGIN",
    });
  });

  it("uses the users binding when meegle auth status is checked without meegleUserKey", async () => {
    const user = await resolvedUserStore.create({
      status: "pending_lark_identity",
      meegleUserKey: "user_xxx",
    });

    await tokenStore.save({
      masterUserId: user.id,
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
        masterUserId: user.id,
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "ready",
        masterUserId: user.id,
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        credentialStatus: "active",
        expiresAt: "2099-03-26T10:30:00.000Z",
        reason: "Stored Meegle token is available",
      },
    });
  });

  it("returns ready when a stored token exists for the current user", async () => {
    await tokenStore.save({
      masterUserId: "usr_xxx",
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
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "ready",
        masterUserId: "usr_xxx",
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
        masterUserId: "usr_missing",
        meegleUserKey: "user_missing",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "require_auth_code",
        masterUserId: "usr_missing",
        meegleUserKey: "user_missing",
        baseUrl: "https://project.larksuite.com",
        reason: "No stored Meegle token found",
      },
    });
  });

  it("returns ready even when the request baseUrl comes from a different page origin", async () => {
    await tokenStore.save({
      masterUserId: "usr_xxx",
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
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://meegle.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "ready",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        credentialStatus: "active",
        expiresAt: "2099-03-26T10:30:00.000Z",
        reason: "Stored Meegle token is available",
      },
    });
  });

  it("requires meegleUserKey when status is checked without a bound meegle identity", async () => {
    await tokenStore.save({
      masterUserId: "usr_xxx",
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
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "require_auth_code",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
        reason: "Missing meegleUserKey for token lookup",
      },
    });
  });

  it("returns a validation error instead of throwing when masterUserId is missing", async () => {
    await expect(
      getAuthStatusController({
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: expect.stringContaining("masterUserId"),
      },
    });
  });

  it("returns require_auth_code when meegle auth is not configured", async () => {
    configureMeegleAuthServiceDeps({
      authAdapter: undefined as never,
      tokenStore,
      pluginId: "MII_TEST_PLUGIN",
    });

    await expect(
      getAuthStatusController({
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "require_auth_code",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        reason: "Meegle auth is not configured",
      },
    });
  });

  it("returns a structured config error for exchange when meegle auth is not configured", async () => {
    configureMeegleAuthServiceDeps({
      authAdapter: undefined as never,
      tokenStore,
      pluginId: "MII_TEST_PLUGIN",
    });

    await expect(
      exchangeAuthCodeController({
        requestId: "req_001",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "code_123",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        errorCode: "MEEGLE_AUTH_NOT_CONFIGURED",
        errorMessage: "Meegle auth adapter is not configured",
      },
    });
  });

  it("updates the users binding after a successful meegle auth exchange", async () => {
    const user = await resolvedUserStore.create({
      status: "pending_lark_identity",
    });

    const getPluginToken = vi.fn().mockResolvedValue({
      token: "plugin_token_123",
      expiresInSeconds: 3600,
    });
    const exchangeUserToken = vi.fn().mockResolvedValue({
      userToken: "user_token_456",
      expiresInSeconds: 3600,
      refreshToken: "refresh_token_789",
      refreshTokenExpiresInSeconds: 7200,
    });

    configureMeegleAuthServiceDeps({
      authAdapter: {
        getPluginToken,
        exchangeUserToken,
        refreshUserToken: vi.fn(),
      },
      tokenStore,
      pluginId: "MII_TEST_PLUGIN",
    });

    await expect(
      exchangeAuthCodeController({
        requestId: "req_001",
        masterUserId: user.id,
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "code_123",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        tokenStatus: "ready",
        credentialStatus: "active",
      }),
    );

    await expect(resolvedUserStore.getById(user.id)).resolves.toEqual(
      expect.objectContaining({
        id: user.id,
        meegleUserKey: "user_xxx",
        meegleBaseUrl: "https://project.larksuite.com",
      }),
    );
  });
});
