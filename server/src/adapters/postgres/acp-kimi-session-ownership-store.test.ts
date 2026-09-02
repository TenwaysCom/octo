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

    await expect(store.attachTicket({
      sessionId: "sess_1",
      operatorLarkId: "ou_1",
      title: "Analyze Ticket",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      threadId: "thread_1",
      threadSnapshotVersion: 3,
      threadContextSyncedAt: "2026-08-26T12:00:00.000Z",
    })).resolves.toMatchObject({
      threadId: "thread_1",
      threadSnapshotVersion: 3,
      threadContextSyncedAt: "2026-08-26T12:00:00.000Z",
    });

    await expect(store.updateRun({
      sessionId: "sess_1",
      operatorLarkId: "ou_1",
      actionRunId: "action_1",
      status: "failed",
      errorCode: "SUPPORT_QA_EVIDENCE_NOT_FETCHED",
      errorMessage: "Evidence fetch did not complete.",
      unverifiedOutput: "Saved but not accepted",
    })).resolves.toMatchObject({
      actionRunId: "action_1",
      runStatus: "failed",
      runErrorCode: "SUPPORT_QA_EVIDENCE_NOT_FETCHED",
      unverifiedOutput: "Saved but not accepted",
    });
  });
});
