import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresLarkTokenStore } from "./lark-token-store.js";

describe("PostgresLarkTokenStore", () => {
  it("stores lark tokens separately by tenant key", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresLarkTokenStore(db);

    await store.save({
      masterUserId: "usr_1",
      tenantKey: "tenant_a",
      larkUserId: "ou_same",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_a",
      credentialStatus: "active",
    });

    await store.save({
      masterUserId: "usr_1",
      tenantKey: "tenant_b",
      larkUserId: "ou_same",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_b",
      credentialStatus: "active",
    });

    await expect(store.get({
      masterUserId: "usr_1",
      tenantKey: "tenant_a",
      larkUserId: "ou_same",
      baseUrl: "https://open.larksuite.com",
    })).resolves.toMatchObject({
      tenantKey: "tenant_a",
      userToken: "token_a",
    });

    await expect(store.get({
      masterUserId: "usr_1",
      tenantKey: "tenant_b",
      larkUserId: "ou_same",
      baseUrl: "https://open.larksuite.com",
    })).resolves.toMatchObject({
      tenantKey: "tenant_b",
      userToken: "token_b",
    });
  });
});
