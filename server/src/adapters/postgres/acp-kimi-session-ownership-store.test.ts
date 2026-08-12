import { PostgresAcpKimiSessionOwnershipStore } from "./acp-kimi-session-ownership-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresAcpKimiSessionOwnershipStore", () => {
  it("persists the Kimi runtime location and keeps its original value when re-claimed", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresAcpKimiSessionOwnershipStore(db);

    await store.claim({
      sessionId: "sess_1",
      operatorLarkId: "ou_1",
      runtimeHostName: "octo-server-1",
      kimiWorkDir: "/srv/octo/server",
    });
    const record = await store.claim({
      sessionId: "sess_1",
      operatorLarkId: "ou_1",
      runtimeHostName: "octo-server-2",
      kimiWorkDir: "/srv/octo-alt/server",
    });

    expect(record).toMatchObject({
      sessionId: "sess_1",
      operatorLarkId: "ou_1",
      runtimeHostName: "octo-server-1",
      kimiWorkDir: "/srv/octo/server",
    });
  });
});
