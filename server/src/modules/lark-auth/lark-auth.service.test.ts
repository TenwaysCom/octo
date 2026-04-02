import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createSqliteDatabase } from "../../adapters/sqlite/database.js";
import { SqliteOauthSessionStore } from "../../adapters/sqlite/lark-oauth-session-store.js";
import { SqliteLarkTokenStore } from "../../adapters/sqlite/lark-token-store.js";
import {
  SqliteResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/sqlite/resolved-user-store.js";
import {
  checkLarkAuthStatus,
  configureLarkAuthServiceDeps,
  exchangeLarkAuthCode,
  handleLarkAuthCallback,
  refreshLarkToken,
  startLarkOauthSession,
} from "./lark-auth.service.js";

describe("lark-auth.service", () => {
  let db: DatabaseSync;
  let resolvedUserStore: SqliteResolvedUserStore;

  beforeEach(() => {
    db = createSqliteDatabase(":memory:");
    resolvedUserStore = new SqliteResolvedUserStore(db);
    configureResolvedUserStore(resolvedUserStore);
    configureLarkAuthServiceDeps({
      appId: "cli_test",
      appSecret: "secret_test",
      fetchImpl: vi.fn(),
      resolvedUserStore,
      tokenStore: new SqliteLarkTokenStore(db),
      oauthSessionStore: new SqliteOauthSessionStore(db),
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
    });

    const tokenRow = db.prepare(`
      SELECT provider_tenant_key, external_user_key
      FROM user_tokens
      WHERE master_user_id = ? AND provider = 'lark'
    `).get(user.id) as { provider_tenant_key: string; external_user_key: string } | undefined;

    expect(tokenRow).toEqual({
      provider_tenant_key: "tenant_123",
      external_user_key: "ou_123",
    });
  });
});
