import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter.js";
import {
  InMemoryMeegleTokenStore,
  type StoredMeegleToken,
} from "../../adapters/meegle/token-store.js";
import {
  PostgresResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { validateExecutionDraft } from "../../validators/agent-output/execution-draft.js";
import {
  MeegleApplyError,
  executeMeegleApply,
  type MeegleApplyExecutionDeps,
} from "./meegle-apply.service.js";
import { configureMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";

describe("meegle-apply.service", () => {
  const draft = validateExecutionDraft({
    draftId: "draft_b2_001",
    draftType: "b2",
    sourceRef: {
      sourcePlatform: "lark_base",
      sourceRecordId: "record_001",
    },
    target: {
      projectKey: "OPS",
      workitemTypeKey: "bug",
      templateId: "production-bug",
    },
    name: "支付页白屏",
    needConfirm: true,
    fieldValuePairs: [
      {
        fieldKey: "priority",
        fieldValue: "P1",
      },
    ],
    ownerUserKeys: ["owner_a"],
    missingMeta: [],
  });

  let resolvedUserStore: PostgresResolvedUserStore;
  let tokenStore: InMemoryMeegleTokenStore;
  let authAdapter: MeegleAuthAdapter;
  let createClient: ReturnType<typeof vi.fn>;
  let createWorkitemFromDraft: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { db } = await createTestPostgresDatabase();
    resolvedUserStore = new PostgresResolvedUserStore(db);
    configureResolvedUserStore(resolvedUserStore);
    tokenStore = new InMemoryMeegleTokenStore();
    createClient = vi.fn(async (input) => ({ ...input, clientTag: "mock-client" }));
    createWorkitemFromDraft = vi.fn().mockResolvedValue({
      workitemId: "WK-123",
      workitem: {
        id: "WK-123",
      },
    });

    authAdapter = {
      getPluginToken: vi.fn().mockResolvedValue({
        token: "plugin_token_123",
        expiresInSeconds: 7200,
      }),
      exchangeUserToken: vi.fn(),
      refreshUserToken: vi.fn().mockResolvedValue({
        userToken: "refreshed_user_token",
        refreshToken: "refreshed_refresh_token",
        expiresInSeconds: 3600,
        refreshTokenExpiresInSeconds: 1209600,
      }),
    };
    configureMeegleAuthServiceDeps({
      authAdapter,
      tokenStore,
      pluginId: "MEEGLE_PLUGIN_ID",
      meegleAuthBaseUrl: "https://project.larksuite.com",
    });
  });

  function buildDeps(): MeegleApplyExecutionDeps {
    return {
      resolvedUserStore,
      authAdapter,
      tokenStore,
      createClient,
      createWorkitemFromDraft,
    };
  }

  async function seedToken(input: StoredMeegleToken): Promise<void> {
    await tokenStore.save(input);
  }

  it("prefers masterUserId over operatorLarkId when both resolve", async () => {
    const masterUser = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_master",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "master_user_key",
    });
    await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_operator",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "operator_user_key",
    });
    await seedToken({
      masterUserId: masterUser.id,
      meegleUserKey: "master_user_key",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "old_user_token",
      userTokenExpiresAt: "2026-03-26T09:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      executeMeegleApply(
        {
          requestId: "req_001",
          draft,
          operatorLarkId: "ou_operator",
          masterUserId: masterUser.id,
          idempotencyKey: "idem_001",
        },
        buildDeps(),
      ),
    ).resolves.toMatchObject({
      status: "created",
      workitemId: "WK-123",
    });

    expect(createClient).toHaveBeenCalledWith({
      userToken: "refreshed_user_token",
      userKey: "master_user_key",
      baseUrl: "https://project.larksuite.com",
    });
    expect(createWorkitemFromDraft).toHaveBeenCalledWith(
      draft,
      { client: expect.objectContaining({ clientTag: "mock-client" }) },
      { idempotencyKey: "idem_001" },
    );
  });

  it("falls back to operatorLarkId when masterUserId is not available", async () => {
    const operatorUser = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_operator",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "operator_user_key",
    });
    await seedToken({
      masterUserId: operatorUser.id,
      meegleUserKey: "operator_user_key",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "ready_user_token",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await executeMeegleApply(
      {
        requestId: "req_002",
        draft,
        operatorLarkId: "ou_operator",
        idempotencyKey: "idem_002",
      },
      buildDeps(),
    );

    expect(createClient).toHaveBeenCalledWith({
      userToken: "ready_user_token",
      userKey: "operator_user_key",
      baseUrl: "https://project.larksuite.com",
    });
  });

  it("throws IDENTITY_NOT_FOUND when no user can be resolved", async () => {
    await expect(
      executeMeegleApply(
        {
          requestId: "req_003",
          draft,
          operatorLarkId: "ou_missing",
          idempotencyKey: "idem_003",
        },
        buildDeps(),
      ),
    ).rejects.toMatchObject({
      errorCode: "IDENTITY_NOT_FOUND",
    });
  });

  it("throws MEEGLE_BINDING_REQUIRED when the resolved user has no Meegle binding", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_binding_missing",
    });

    await expect(
      executeMeegleApply(
        {
          requestId: "req_004",
          draft,
          masterUserId: user.id,
          operatorLarkId: "ou_binding_missing",
          idempotencyKey: "idem_004",
        },
        buildDeps(),
      ),
    ).rejects.toMatchObject({
      errorCode: "MEEGLE_BINDING_REQUIRED",
    });
  });

  it("throws MEEGLE_AUTH_REQUIRED when Meegle auth cannot refresh a token", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_auth_required",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "auth_user_key",
    });

    await expect(
      executeMeegleApply(
        {
          requestId: "req_005",
          draft,
          masterUserId: user.id,
          operatorLarkId: "ou_auth_required",
          idempotencyKey: "idem_005",
        },
        buildDeps(),
      ),
    ).rejects.toMatchObject({
      errorCode: "MEEGLE_AUTH_REQUIRED",
    });
  });

  it("throws MEEGLE_WORKITEM_CREATE_FAILED when Meegle workitem creation fails", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_create_fail",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "create_user_key",
    });
    await seedToken({
      masterUserId: user.id,
      meegleUserKey: "create_user_key",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "ready_user_token",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });
    createWorkitemFromDraft.mockRejectedValueOnce(new Error("create failed"));

    await expect(
      executeMeegleApply(
        {
          requestId: "req_006",
          draft,
          masterUserId: user.id,
          operatorLarkId: "ou_create_fail",
          idempotencyKey: "idem_006",
        },
        buildDeps(),
      ),
    ).rejects.toMatchObject({
      errorCode: "MEEGLE_WORKITEM_CREATE_FAILED",
    });
  });

  it("uses configured Meegle auth deps when explicit auth deps are omitted", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_configured",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "configured_user_key",
    });
    await seedToken({
      masterUserId: user.id,
      meegleUserKey: "configured_user_key",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "ready_user_token",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    await expect(
      executeMeegleApply(
        {
          requestId: "req_007",
          draft,
          masterUserId: user.id,
          operatorLarkId: "ou_configured",
          idempotencyKey: "idem_007",
        },
        {
          resolvedUserStore,
          createClient,
          createWorkitemFromDraft,
        },
      ),
    ).resolves.toMatchObject({
      status: "created",
      workitemId: "WK-123",
    });

    expect(createClient).toHaveBeenCalledWith({
      userToken: "ready_user_token",
      userKey: "configured_user_key",
      baseUrl: "https://project.larksuite.com",
    });
  });

  it("prefers explicit auth deps even when global auth config is absent", async () => {
    const user = await resolvedUserStore.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_explicit_only",
      meegleBaseUrl: "https://project.larksuite.com",
      meegleUserKey: "explicit_user_key",
    });
    await seedToken({
      masterUserId: user.id,
      meegleUserKey: "explicit_user_key",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "ready_user_token",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    configureMeegleAuthServiceDeps({
      authAdapter: undefined as unknown as MeegleAuthAdapter,
      tokenStore: undefined,
      pluginId: undefined,
      meegleAuthBaseUrl: undefined,
    });

    await expect(
      executeMeegleApply(
        {
          requestId: "req_008",
          draft,
          masterUserId: user.id,
          operatorLarkId: "ou_explicit_only",
          idempotencyKey: "idem_008",
        },
        buildDeps(),
      ),
    ).resolves.toMatchObject({
      status: "created",
      workitemId: "WK-123",
    });

    expect(createClient).toHaveBeenCalledWith({
      userToken: "ready_user_token",
      userKey: "explicit_user_key",
      baseUrl: "https://project.larksuite.com",
    });
  });
});
