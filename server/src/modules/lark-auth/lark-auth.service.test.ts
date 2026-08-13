import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import { PostgresOauthSessionStore } from "../../adapters/postgres/lark-oauth-session-store.js";
import { PostgresLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import { PostgresWebSessionStore } from "../../adapters/postgres/web-session-store.js";
import { PostgresWebPluginLoginChallengeStore } from "../../adapters/postgres/web-plugin-login-challenge-store.js";
import { InMemoryMeegleTokenStore } from "../../adapters/meegle/token-store.js";
import {
  PostgresResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import type { LarkContactStore } from "../../adapters/lark/contact-store.js";
import type { DatabaseSchema } from "../../adapters/postgres/schema.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import {
  checkLarkAuthStatus,
  configureLarkAuthServiceDeps,
  exchangeLarkAuthCode,
  fetchLarkUserInfo,
  handleLarkAuthCallback,
  handleLarkWebAuthCallback,
  getLarkWebProfile,
  ensureLarkWebSession,
  logoutLarkWebSession,
  approveWebPluginLoginChallenge,
  completeWebPluginLoginChallenge,
  createWebPluginLoginChallenge,
  refreshLarkToken,
  startLarkOauthSession,
} from "./lark-auth.service.js";

describe("lark-auth.service", () => {
  let db: Kysely<DatabaseSchema>;
  let resolvedUserStore: PostgresResolvedUserStore;
  let tokenStore: PostgresLarkTokenStore;
  let oauthSessionStore: PostgresOauthSessionStore;
  let webSessionStore: PostgresWebSessionStore;
  let webPluginLoginChallengeStore: PostgresWebPluginLoginChallengeStore;
  let meegleTokenStore: InMemoryMeegleTokenStore;

  beforeEach(async () => {
    ({ db } = await createTestPostgresDatabase());
    resolvedUserStore = new PostgresResolvedUserStore(db);
    tokenStore = new PostgresLarkTokenStore(db);
    oauthSessionStore = new PostgresOauthSessionStore(db);
    webSessionStore = new PostgresWebSessionStore(db);
    webPluginLoginChallengeStore = new PostgresWebPluginLoginChallengeStore(db);
    meegleTokenStore = new InMemoryMeegleTokenStore();
    configureResolvedUserStore(resolvedUserStore);
    configureLarkAuthServiceDeps({
      appId: "cli_test",
      appSecret: "secret_test",
      fetchImpl: vi.fn(),
      resolvedUserStore,
      tokenStore,
      oauthSessionStore,
      webSessionStore,
      webPluginLoginChallengeStore,
      meegleTokenStore,
    });
  });

  it("creates a web session from a one-time plugin approval without exposing the plugin identity", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_plugin",
      larkId: "ou_plugin",
    });
    await tokenStore.save({
      masterUserId: user.id,
      tenantKey: "tenant_plugin",
      larkUserId: "ou_plugin",
      baseUrl: "https://open.larksuite.com",
      userToken: "lark_user_token",
      userTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      credentialStatus: "active",
      lastAuthAt: "2026-08-08T00:00:00.000Z",
    });

    const challenge = await createWebPluginLoginChallenge();
    await expect(approveWebPluginLoginChallenge({
      challengeId: challenge.challengeId,
      masterUserId: user.id,
    })).resolves.toEqual({ ok: true });

    await expect(completeWebPluginLoginChallenge({
      challengeId: challenge.challengeId,
      browserProof: "wrong_browser_proof",
    })).resolves.toMatchObject({ ok: false, errorCode: "WEB_PLUGIN_LOGIN_INVALID" });

    const completed = await completeWebPluginLoginChallenge({
      challengeId: challenge.challengeId,
      browserProof: challenge.browserProof,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      throw new Error("Expected plugin login completion to succeed");
    }
    await expect(ensureLarkWebSession(completed.sessionToken)).resolves.toMatchObject({ ok: true });
    await expect(completeWebPluginLoginChallenge({
      challengeId: challenge.challengeId,
      browserProof: challenge.browserProof,
    })).resolves.toMatchObject({ ok: false, errorCode: "WEB_PLUGIN_LOGIN_INVALID" });
  });

  it("returns a sanitized Meegle authorization status for the web profile", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_profile",
      larkId: "ou_profile",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "meegle_profile",
      githubId: "octo",
      role: "devops",
    });
    await tokenStore.save({
      masterUserId: user.id,
      tenantKey: "tenant_profile",
      larkUserId: "ou_profile",
      baseUrl: "https://open.larksuite.com",
      userToken: "lark_user_token",
      userTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      credentialStatus: "active",
    });
    await meegleTokenStore.save({
      masterUserId: user.id,
      meegleUserKey: "meegle_profile",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token",
      userToken: "meegle_user_token",
      userTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      credentialStatus: "active",
    });

    const challenge = await createWebPluginLoginChallenge();
    await approveWebPluginLoginChallenge({ challengeId: challenge.challengeId, masterUserId: user.id });
    const completed = await completeWebPluginLoginChallenge({
      challengeId: challenge.challengeId,
      browserProof: challenge.browserProof,
    });
    if (!completed.ok) {
      throw new Error("Expected plugin login completion to succeed");
    }

    await expect(getLarkWebProfile(completed.sessionToken)).resolves.toMatchObject({
      ok: true,
      profile: {
        user: { githubId: "octo" },
        workspaceAccess: { platformLists: true, platformSync: true },
        larkAuthorization: { status: "ready" },
        meegleAuthorization: { status: "ready" },
      },
    });
    const profile = await getLarkWebProfile(completed.sessionToken);
    if (!profile.ok) {
      throw new Error("Expected web profile to be available");
    }
    expect(profile.profile).not.toHaveProperty("masterUserId");
    expect(JSON.stringify(profile.profile)).not.toContain("meegle_user_token");

    await meegleTokenStore.save({
      masterUserId: user.id,
      meegleUserKey: "meegle_profile",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token",
      userToken: "meegle_user_token",
      userTokenExpiresAt: "2000-01-01T00:00:00.000Z",
      credentialStatus: "expired",
    });
    await expect(getLarkWebProfile(completed.sessionToken)).resolves.toMatchObject({
      ok: true,
      profile: { meegleAuthorization: { status: "require_auth" } },
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

  it("creates a user and opaque web session when a Lark callback has no master user", async () => {
    await startLarkOauthSession({
      state: "web_state_123",
      baseUrl: "https://open.larksuite.com",
    });

    const result = await handleLarkWebAuthCallback(
      { code: "web_code_123", state: "web_state_123" },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ code: 0, app_access_token: "app_access_token_123" }),
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
                open_id: "ou_web_user",
                tenant_key: "tenant_web",
                email: "web@example.com",
                name: "Web User",
              },
            }),
          }) as unknown as typeof fetch,
        resolvedUserStore,
        tokenStore,
        oauthSessionStore,
        webSessionStore,
      },
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new Error("Expected a ready web callback result");
    }

    await expect(ensureLarkWebSession(result.sessionToken, {
      appId: "cli_test",
      appSecret: "secret_test",
      resolvedUserStore,
      tokenStore,
      oauthSessionStore,
      webSessionStore,
    })).resolves.toEqual({
      ok: true,
      user: { larkName: "Web User", larkEmail: "web@example.com", larkAvatarUrl: undefined },
    });

    await expect(getLarkWebProfile(result.sessionToken, {
      appId: "cli_test",
      appSecret: "secret_test",
      resolvedUserStore,
      tokenStore,
      oauthSessionStore,
      webSessionStore,
    })).resolves.toMatchObject({
      ok: true,
      profile: {
        user: { larkName: "Web User", larkEmail: "web@example.com" },
        larkAuthorization: { status: "ready", authorizedAt: expect.any(String) },
      },
    });

    const user = await resolvedUserStore.getByLarkIdentity("tenant_web", "ou_web_user");
    const token = await tokenStore.get({
      masterUserId: user!.id,
      baseUrl: "https://open.larksuite.com",
    });
    await tokenStore.save({
      ...token!,
      userTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      refreshToken: undefined,
      refreshTokenExpiresAt: undefined,
      credentialStatus: "expired",
    });

    await expect(ensureLarkWebSession(result.sessionToken, {
      appId: "cli_test",
      appSecret: "secret_test",
      resolvedUserStore,
      tokenStore,
      webSessionStore,
    })).resolves.toMatchObject({ ok: true });
    await expect(getLarkWebProfile(result.sessionToken, {
      appId: "cli_test",
      appSecret: "secret_test",
      resolvedUserStore,
      tokenStore,
      webSessionStore,
    })).resolves.toMatchObject({
      ok: true,
      profile: { larkAuthorization: { status: "require_auth" } },
    });

    await logoutLarkWebSession(result.sessionToken, {
      appId: "cli_test",
      appSecret: "secret_test",
      webSessionStore,
    });
    await expect(ensureLarkWebSession(result.sessionToken, {
      appId: "cli_test",
      appSecret: "secret_test",
      webSessionStore,
    })).resolves.toMatchObject({ ok: false, errorCode: "UNAUTHENTICATED" });
  });

  it("uses OAuth open_id and enriches a missing profile through the matching Contact identity type", async () => {
    await startLarkOauthSession({
      state: "web_open_id_state",
      baseUrl: "https://open.larksuite.com",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, app_access_token: "app_access_token_123" }),
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
          data: { open_id: "ou_open_id_user", tenant_key: "tenant_open_id" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            user: {
              name: "Open ID User",
              enterprise_email: "open-id@example.com",
              avatar: { avatar_240: "https://example.com/open-id-avatar.png" },
            },
          },
        }),
      });

    const result = await handleLarkWebAuthCallback(
      { code: "web_open_id_code", state: "web_open_id_state" },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolvedUserStore,
        tokenStore,
        oauthSessionStore,
        webSessionStore,
      },
    );

    expect(result.kind).toBe("ready");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://open.larksuite.com/open-apis/contact/v3/users/ou_open_id_user?user_id_type=open_id",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer user_access_token_456" }),
      }),
    );
    await expect(resolvedUserStore.getByLarkIdentity("tenant_open_id", "ou_open_id_user")).resolves.toMatchObject({
      larkName: "Open ID User",
      larkEmail: "open-id@example.com",
      larkAvatarUrl: "https://example.com/open-id-avatar.png",
    });
  });

  it("rejects an OAuth profile without an open_id", async () => {
    await startLarkOauthSession({
      state: "web_missing_open_id_state",
      baseUrl: "https://open.larksuite.com",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, app_access_token: "app_access_token_123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            access_token: "user_access_token_456",
            expires_in: 7200,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { user_id: "legacy_user_id", tenant_key: "tenant_open_id" },
        }),
      });

    const result = await handleLarkWebAuthCallback(
      { code: "web_missing_open_id_code", state: "web_missing_open_id_state" },
      {
        appId: "cli_test",
        appSecret: "secret_test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolvedUserStore,
        tokenStore,
        oauthSessionStore,
        webSessionStore,
      },
    );

    expect(result).toMatchObject({ kind: "failed" });
    if (result.kind === "failed") {
      expect(result.page.body).toContain("missing open_id or tenant identity");
    }
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
            open_id: "ou_123",
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
      refreshTokenExpiresAt: "2099-05-18T00:00:00.000Z",
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
            open_id: "ou_123",
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
      openId: "ou_123",
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

  it("caches fetched Lark contact details by open id", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_123",
      larkId: "ou_123",
    });
    const contactStore: LarkContactStore = {
      getByOpenId: vi.fn(),
      getByEmail: vi.fn(),
      getByMeegleUserKey: vi.fn(),
      upsert: vi.fn().mockResolvedValue({
        openId: "ou_123",
        email: "user@example.com",
        name: "Test User",
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T00:00:00.000Z",
      }),
    };

    await tokenStore.save({
      masterUserId: user.id,
      tenantKey: "tenant_123",
      larkUserId: "ou_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "valid_token",
      userTokenExpiresAt: "2026-07-18T00:00:00.000Z",
      refreshToken: "refresh_token_123",
      refreshTokenExpiresAt: "2026-07-18T00:00:00.000Z",
      credentialStatus: "active",
    });

    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          open_id: "ou_123",
          tenant_key: "tenant_123",
          email: "user@example.com",
          name: "Test User",
        },
      }),
    });

    await fetchLarkUserInfo(
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
        contactStore,
      },
    );

    expect(contactStore.upsert).toHaveBeenCalledWith({
      openId: "ou_123",
      email: "user@example.com",
      name: "Test User",
    });
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
      userTokenExpiresAt: "2099-05-18T00:00:00.000Z",
      refreshToken: "refresh_token_123",
      refreshTokenExpiresAt: "2099-06-18T00:00:00.000Z",
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
            open_id: "ou_123",
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
      openId: "ou_123",
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
