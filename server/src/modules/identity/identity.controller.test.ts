import { beforeEach, describe, expect, it } from "vitest";
import { createSqliteDatabase } from "../../adapters/sqlite/database.js";
import {
  SqliteResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/sqlite/resolved-user-store.js";
import { resolveIdentityController } from "./identity.controller.js";

describe("identity.controller", () => {
  beforeEach(() => {
    configureResolvedUserStore(
      new SqliteResolvedUserStore(createSqliteDatabase(":memory:")),
    );
  });

  it("creates a pending user when only meegle identity is available", async () => {
    await expect(
      resolveIdentityController({
        requestId: "req_001",
        meegleUserKey: "user_xxx",
        pageContext: {
          platform: "meegle",
          baseUrl: "https://project.larksuite.com",
          pathname: "/wiki/test",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        masterUserId: expect.any(String),
        identityStatus: "pending_lark_identity",
        meegleUserKey: "user_xxx",
      }),
    });
  });

  it("reuses the same user when resolving the same meegle identity again", async () => {
    const first = await resolveIdentityController({
      requestId: "req_001",
      meegleUserKey: "user_xxx",
      pageContext: {
        platform: "meegle",
        baseUrl: "https://project.larksuite.com",
        pathname: "/wiki/test",
      },
    });

    const second = await resolveIdentityController({
      requestId: "req_002",
      meegleUserKey: "user_xxx",
      pageContext: {
        platform: "meegle",
        baseUrl: "https://project.larksuite.com",
        pathname: "/wiki/test",
      },
    });

    expect(second).toEqual({
      ok: true,
      data: expect.objectContaining({
        masterUserId: first.data?.masterUserId,
        identityStatus: "pending_lark_identity",
        meegleUserKey: "user_xxx",
      }),
    });
  });

  it("treats the same meegle user key on different base urls as different bindings", async () => {
    const first = await resolveIdentityController({
      requestId: "req_001",
      meegleUserKey: "user_xxx",
      pageContext: {
        platform: "meegle",
        baseUrl: "https://project.larksuite.com",
        pathname: "/wiki/test",
      },
    });

    const second = await resolveIdentityController({
      requestId: "req_002",
      meegleUserKey: "user_xxx",
      pageContext: {
        platform: "meegle",
        baseUrl: "https://tenant.meegle.com",
        pathname: "/wiki/test",
      },
    });

    expect(second).toEqual({
      ok: true,
      data: expect.objectContaining({
        masterUserId: expect.any(String),
        identityStatus: "pending_lark_identity",
        meegleUserKey: "user_xxx",
      }),
    });
    expect(second.data?.masterUserId).not.toBe(first.data?.masterUserId);
  });

  it("upgrades a pending meegle user to active once lark identity is available", async () => {
    const pending = await resolveIdentityController({
      requestId: "req_001",
      meegleUserKey: "user_xxx",
      pageContext: {
        platform: "meegle",
        baseUrl: "https://project.larksuite.com",
        pathname: "/wiki/test",
      },
    });

    await expect(
      resolveIdentityController({
        requestId: "req_002",
        masterUserId: pending.data?.masterUserId,
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        pageContext: {
          platform: "lark",
          baseUrl: "https://www.larksuite.com",
          pathname: "/base/1",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        masterUserId: pending.data?.masterUserId,
        identityStatus: "active",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
      }),
    });
  });
});
