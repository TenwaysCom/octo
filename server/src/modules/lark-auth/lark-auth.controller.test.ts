import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteDatabase } from "../../adapters/sqlite/database.js";
import {
  SqliteResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/sqlite/resolved-user-store.js";
import {
  configureLarkAuthControllerDeps,
  getAuthStatusController,
  handleAuthCallbackController,
} from "./lark-auth.controller.js";
import {
  configureLarkAuthServiceDeps,
  startLarkOauthSession,
} from "./lark-auth.service.js";

describe("lark-auth.controller", () => {
  beforeEach(() => {
    const db = createSqliteDatabase(":memory:");
    configureResolvedUserStore(new SqliteResolvedUserStore(db));

    configureLarkAuthControllerDeps({
      appId: "cli_test",
      appSecret: "secret_test",
    });

    configureLarkAuthServiceDeps({
      appId: "cli_test",
      appSecret: "secret_test",
      fetchImpl: vi.fn(),
    });
  });

  it("returns require_auth when no stored Lark token exists for the current user", async () => {
    await expect(
      getAuthStatusController({
        masterUserId: "usr_lark_missing",
        baseUrl: "https://open.larksuite.com",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        status: "require_auth",
        masterUserId: "usr_lark_missing",
        baseUrl: "https://open.larksuite.com",
        reason: "No stored Lark token found",
      },
    });
  });

  it("renders a success completion page when callback exchange succeeds", async () => {
    const resolvedUserStore = new SqliteResolvedUserStore(createSqliteDatabase(":memory:"));
    configureResolvedUserStore(resolvedUserStore);
    const user = await resolvedUserStore.create({
      status: "pending_lark_identity",
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
            tenant_key: "tenant_oauth_verified",
            user_id: "ou_oauth_verified",
          },
        }),
      });

    configureLarkAuthServiceDeps({
      appId: "cli_test",
      appSecret: "secret_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await startLarkOauthSession({
      state: "state_success",
      baseUrl: "https://open.larksuite.com",
      masterUserId: user.id,
    });

    await expect(
      handleAuthCallbackController({
        query: {
          code: "code_123",
          state: "state_success",
        },
      }),
    ).resolves.toMatchObject({
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      body: expect.stringContaining("Lark 授权完成"),
    });
  });

  it("renders a failed completion page when callback state validation fails", async () => {
    await expect(
      handleAuthCallbackController({
        query: {
          code: "code_123",
          state: "unknown_state",
          baseUrl: "https://open.larksuite.com",
        },
      }),
    ).resolves.toMatchObject({
      statusCode: 400,
      contentType: "text/html; charset=utf-8",
      body: expect.stringContaining("state 校验失败"),
    });
  });

  it("renders a failed completion page when callback query is invalid", async () => {
    await expect(
      handleAuthCallbackController({
        query: {
          state: "missing_code",
        },
      }),
    ).resolves.toMatchObject({
      statusCode: 400,
      contentType: "text/html; charset=utf-8",
      body: expect.stringContaining("Lark 授权失败"),
    });
  });
});
