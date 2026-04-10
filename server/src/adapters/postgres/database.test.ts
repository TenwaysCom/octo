import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";

describe("postgres database helpers", () => {
  it("allows the same lark id to exist under different tenant keys", async () => {
    const { db } = await createTestPostgresDatabase();

    await db.insertInto("users").values({
      id: "usr_1",
      status: "active",
      lark_tenant_key: "tenant_a",
      lark_id: "ou_same",
      lark_email: null,
      meegle_base_url: null,
      meegle_user_key: null,
      github_id: null,
      created_at: "2026-04-02T00:00:00.000Z",
      updated_at: "2026-04-02T00:00:00.000Z",
    }).execute();

    await expect(
      db.insertInto("users").values({
        id: "usr_2",
        status: "active",
        lark_tenant_key: "tenant_b",
        lark_id: "ou_same",
        lark_email: null,
        meegle_base_url: null,
        meegle_user_key: null,
        github_id: null,
        created_at: "2026-04-02T00:00:00.000Z",
        updated_at: "2026-04-02T00:00:00.000Z",
      }).execute(),
    ).resolves.toBeDefined();
  });

  it("rejects duplicate lark identities within the same tenant", async () => {
    const { db } = await createTestPostgresDatabase();

    await db.insertInto("users").values({
      id: "usr_1",
      status: "active",
      lark_tenant_key: "tenant_a",
      lark_id: "ou_same",
      lark_email: null,
      meegle_base_url: null,
      meegle_user_key: null,
      github_id: null,
      created_at: "2026-04-02T00:00:00.000Z",
      updated_at: "2026-04-02T00:00:00.000Z",
    }).execute();

    await expect(
      db.insertInto("users").values({
        id: "usr_2",
        status: "active",
        lark_tenant_key: "tenant_a",
        lark_id: "ou_same",
        lark_email: null,
        meegle_base_url: null,
        meegle_user_key: null,
        github_id: null,
        created_at: "2026-04-02T00:00:00.000Z",
        updated_at: "2026-04-02T00:00:00.000Z",
      }).execute(),
    ).rejects.toThrow();
  });
});
