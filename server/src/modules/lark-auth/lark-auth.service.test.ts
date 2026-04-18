import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import { PostgresOauthSessionStore } from "../../adapters/postgres/lark-oauth-session-store.js";
import { PostgresLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import {
  PostgresResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import type { DatabaseSchema } from "../../adapters/postgres/schema.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import {
  checkLarkAuthStatus,
  configureLarkAuthServiceDeps,
  exchangeLarkAuthCode,
  fetchLarkUserInfo,
  handleLarkAuthCallback,
  refreshLarkToken,
  startLarkOauthSession,
} from "./lark-auth.service.js";

describe("lark-auth.service", () => {
  let db: Kysely<DatabaseSchema>;
  let resolvedUserStore: PostgresResolvedUserStore;
  let tokenStore: PostgresLarkTokenStore;
  let oauthSessionStore: PostgresOauthSessionStore;

  beforeEach(async () => {
    ({ db } = await createTestPostgresDatabase());
    resolvedUserStore = new PostgresResolvedUserStore(db);
    tokenStore = new PostgresLarkTokenStore(db);
    oauthSessionStore = new PostgresOauthSessionStore(db);
    configureResolvedUserStore(resolvedUserStore);
    configureLarkAuthServiceDeps({
      appId: "cli_test",
      appSecret: "secret_test",
      fetchImpl: vi.fn(),
      resolvedUserStore,
      tokenStore,
      oauthSessionStore,
    });
  });

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
            refresh_token_expires_in: 604800,
            token_type: "Bearer",
          },
        }),
      });

    const result = await exchangeLarkAuthCode(
      {
        masterUserId: "usr_xxx",
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
      "https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal",
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
      refreshTokenExpiresIn: 604800,
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
            refresh_token_expires_in: 604800,
            token_type: "Bearer",
          },
        }),
      });

    const result = await refreshLarkToken(
      {
        masterUserId: "usr_xxx",
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
      "https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal",
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
      refreshTokenExpiresIn: 604800,
      tokenType: "Bearer",
    });
  });

  it("creates a pending oauth session keyed by state", async () => {
    await expect(
      startLarkOauthSession({
        state: "state_123",
        baseUrl: "https://open.larksuite.com",
        masterUserId: "usr_123",
      }),
    ).resolves.toMatchObject({
      state: "state_123",
      status: "pending",
      masterUserId: "usr_123",
    });
  });

  it("returns require_auth when no stored token exists", async () => {
    await expect(
      checkLarkAuthStatus({
        masterUserId: "usr_missing",
        baseUrl: "https://open.larksuite.com",
      }),
    ).resolves.toEqual({
      status: "require_auth",
      masterUserId: "usr_missing",
      baseUrl: "https://open.larksuite.com",
      reason: "No stored Lark token found",
    });
  });

  it("returns ready when a stored Lark token exists for masterUserId", async () => {
    const fetchImpl = vi.fn();
    configureLarkAuthServiceDeps({
      appId: "cli_test",
      appSecret: "secret_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolvedUserStore,
      tokenStore,
      oauthSessionStore,
    });
    const user = await resolvedUserStore.create({
      status: "active",
      larkId: "ou_123",
    });

    await exchangeLarkAuthCode(
      {
        masterUserId: user.id,
        baseUrl: "https://open.larksuite.com",
        code: "auth_code_123",
        grantType: "authorization_code",
      },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: vi
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
                refresh_token_expires_in: 604800,
                token_type: "Bearer",
              },
            }),
          }) as unknown as typeof fetch,
      },
    );

    await expect(
      checkLarkAuthStatus({
        masterUserId: user.id,
        baseUrl: "https://open.larksuite.com",
      }),
    ).resolves.toMatchObject({
      status: "ready",
      masterUserId: user.id,
      baseUrl: "https://open.larksuite.com",
    });
  });

  it("returns a failed callback page with the precise reason when oauth exchange fails", async () => {
    const user = await resolvedUserStore.create({
      status: "pending_lark_identity",
    });

    await startLarkOauthSession({
      state: "state_failed",
      baseUrl: "https://open.larksuite.com",
      masterUserId: user.id,
    });

    const result = await handleLarkAuthCallback(
      {
        code: "bad_code",
        state: "state_failed",
      },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: vi
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
              code: 999,
              msg: "invalid authorization code",
            }),
          }) as unknown as typeof fetch,
        resolvedUserStore,
      },
    );

    expect(result.statusCode).toBe(500);
    expect(result.body).toContain("data-lark-auth-reason=\"Lark Authen API error: invalid authorization code\"");
  });

  it("writes tenant-aware lark identity data after a successful callback", async () => {
    const user = await resolvedUserStore.create({
      status: "pending_lark_identity",
    });

    await startLarkOauthSession({
      state: "state_success",
      baseUrl: "https://open.larksuite.com",
      masterUserId: user.id,
    });

    const result = await handleLarkAuthCallback(
      {
        code: "good_code",
        state: "state_success",
      },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: vi
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
                refresh_token_expires_in: 604800,
                token_type: "Bearer",
              },
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              code: 0,
          data: {
            user_id: "ou_123",
            tenant_key: "tenant_123",
            email: "user@example.com",
          },
        }),
      }) as unknown as typeof fetch,
        resolvedUserStore,
      },
    );

    expect(result.statusCode).toBe(200);

    await expect(resolvedUserStore.getById(user.id)).resolves.toMatchObject({
      id: user.id,
      status: "active",
      larkTenantKey: "tenant_123",
      larkId: "ou_123",
      larkEmail: "user@example.com",
    });

    const tokenRow = await db.selectFrom("user_tokens")
      .select(["provider_tenant_key", "external_user_key"])
      .where("master_user_id", "=", user.id)
      .where("provider", "=", "lark")
      .executeTakeFirst();

    expect(tokenRow).toEqual({
      provider_tenant_key: "tenant_123",
      external_user_key: "ou_123",
    });

    const storedToken = await tokenStore.get({
      masterUserId: user.id,
      baseUrl: "https://open.larksuite.com",
    });
    expect(storedToken?.refreshTokenExpiresAt).toBeTruthy();
    expect(Date.parse(storedToken!.refreshTokenExpiresAt!)).toBeGreaterThan(Date.now());
  });

  it("refreshes an expired stored Lark token before fetching user info", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_123",
      larkId: "ou_123",
    });

    await tokenStore.save({
      masterUserId: user.id,
      tenantKey: "tenant_123",
      larkUserId: "ou_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "expired_token",
      userTokenExpiresAt: "2026-04-18T00:00:00.000Z",
      refreshToken: "refresh_token_123",
      refreshTokenExpiresAt: "2026-05-18T00:00:00.000Z",
      credentialStatus: "active",
    });

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
            access_token: "fresh_access_token",
            refresh_token: "fresh_refresh_token",
            expires_in: 7200,
            refresh_token_expires_in: 604800,
            token_type: "Bearer",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            user_id: "ou_123",
            tenant_key: "tenant_123",
            email: "user@example.com",
            name: "Test User",
            avatar_url: "https://example.com/avatar.png",
          },
        }),
      });

    await expect(
      fetchLarkUserInfo(
        {
          masterUserId: user.id,
          baseUrl: "https://open.larksuite.com",
        },
        {
          appId: "cli_test",
          appSecret: "secret_test",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          tokenStore,
          resolvedUserStore,
        },
      ),
    ).resolves.toEqual({
      userId: "ou_123",
      tenantKey: "tenant_123",
      email: "user@example.com",
      name: "Test User",
      avatarUrl: "https://example.com/avatar.png",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://open.larksuite.com/open-apis/authen/v1/user_info",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer fresh_access_token",
        }),
      }),
    );
  });

  it("refreshes and retries when Lark user info rejects the stored token as invalid", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_123",
      larkId: "ou_123",
    });

    await tokenStore.save({
      masterUserId: user.id,
      tenantKey: "tenant_123",
      larkUserId: "ou_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "stale_but_not_marked_expired",
      userTokenExpiresAt: "2026-05-18T00:00:00.000Z",
      refreshToken: "refresh_token_123",
      refreshTokenExpiresAt: "2026-06-18T00:00:00.000Z",
      credentialStatus: "active",
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 20005,
          msg: "invalid access token",
        }),
      })
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
            access_token: "fresh_access_token",
            refresh_token: "fresh_refresh_token",
            expires_in: 7200,
            refresh_token_expires_in: 604800,
            token_type: "Bearer",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            user_id: "ou_123",
            tenant_key: "tenant_123",
            email: "user@example.com",
            name: "Test User",
            avatar_url: "https://example.com/avatar.png",
          },
        }),
      });

    await expect(
      fetchLarkUserInfo(
        {
          masterUserId: user.id,
          baseUrl: "https://open.larksuite.com",
        },
        {
          appId: "cli_test",
          appSecret: "secret_test",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          tokenStore,
          resolvedUserStore,
        },
      ),
    ).resolves.toEqual({
      userId: "ou_123",
      tenantKey: "tenant_123",
      email: "user@example.com",
      name: "Test User",
      avatarUrl: "https://example.com/avatar.png",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://open.larksuite.com/open-apis/authen/v1/user_info",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer stale_but_not_marked_expired",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://open.larksuite.com/open-apis/authen/v1/user_info",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer fresh_access_token",
        }),
      }),
    );
  });
});
