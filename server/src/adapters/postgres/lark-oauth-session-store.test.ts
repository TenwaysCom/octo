import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresOauthSessionStore } from "./lark-oauth-session-store.js";

describe("PostgresOauthSessionStore", () => {
  it("creates a pending oauth session keyed by state", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresOauthSessionStore(db);

    await expect(
      store.save({
        state: "state_123",
        provider: "lark",
        baseUrl: "https://open.larksuite.com",
        masterUserId: "usr_123",
        status: "pending",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      state: "state_123",
      status: "pending",
      masterUserId: "usr_123",
    });
  });
});
