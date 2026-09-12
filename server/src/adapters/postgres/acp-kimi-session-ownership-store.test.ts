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
      automationActionKey: "lark-ticket-support-qa-answer",
      permissionProfileId: "support-qa.answer.v1",
      permissionProfileVersion: "1",
      actionRunId: "action_1",
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
      permissionProfileId: "support-qa.answer.v1",
      permissionProfileVersion: "1",
      actionRunId: "action_1",
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

it("keeps provider and full native ID across store instances, including lazy legacy backfill", async () => {
  const { db } = await createTestPostgresDatabase();
  const store = new PostgresAcpKimiSessionOwnershipStore(db);
  try {
    await store.claim({ sessionId: "public", agentProvider: "hermes_acp", agentSessionId: "native", operatorLarkId: "owner" });
    const reloaded = new PostgresAcpKimiSessionOwnershipStore(db);
    expect(await reloaded.getBySessionId("public")).toMatchObject({ sessionId: "public", agentProvider: "hermes_acp", agentSessionId: "native" });
    for (const sessionId of ["hermes_11111111-1111-4111-8111-111111111111", "old-kimi-session"]) {
      await db.insertInto("acp_kimi_session_owners").values({ session_id: sessionId, operator_lark_id: "owner", created_at: "now", updated_at: "now" }).execute();
      expect(await store.getBySessionId(sessionId)).toMatchObject({ agentProvider: sessionId.startsWith("hermes_") ? "hermes_acp" : "kimi_acp", agentSessionId: sessionId });
      expect(await db.selectFrom("acp_kimi_session_owners").select("agent_session_id").where("session_id", "=", sessionId).executeTakeFirst()).toEqual({ agent_session_id: sessionId });
    }
  } finally { await db.destroy(); }
});

it("cannot reassign another owner's session or change its native identity", async () => {
  const { db } = await createTestPostgresDatabase();
  const store = new PostgresAcpKimiSessionOwnershipStore(db);
  try {
    await store.claim({ sessionId: "public", operatorLarkId: "owner", agentProvider: "hermes_acp", agentSessionId: "native" });
    await expect(store.claim({ sessionId: "public", operatorLarkId: "other" })).rejects.toThrow("another operator");
    await expect(store.claim({ sessionId: "public", operatorLarkId: "owner", agentSessionId: "replacement" })).rejects.toThrow("identity cannot be changed");
    expect(await store.getBySessionId("public")).toMatchObject({ operatorLarkId: "owner", agentSessionId: "native", agentProvider: "hermes_acp" });
  } finally { await db.destroy(); }
});
