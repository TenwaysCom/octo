import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresResolvedUserStore } from "./resolved-user-store.js";

describe("PostgresResolvedUserStore", () => {
  it("looks up lark users by tenant key and lark id", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresResolvedUserStore(db);

    await store.create({
      status: "active",
      larkTenantKey: "tenant_a",
      larkId: "ou_same",
    });
    const userB = await store.create({
      status: "active",
      larkTenantKey: "tenant_b",
      larkId: "ou_same",
    });

    await expect(
      store.getByLarkIdentity("tenant_b", "ou_same"),
    ).resolves.toMatchObject({
      id: userB.id,
      larkTenantKey: "tenant_b",
      larkId: "ou_same",
    });
  });
});
