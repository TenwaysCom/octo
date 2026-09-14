import { createHash } from "node:crypto";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresSupportTicketEffectDraftStore } from "./support-ticket-effect-draft-store.js";

describe("PostgresSupportTicketEffectDraftStore", () => {
  it("persists one idempotent draft and transitions it with compare-and-set", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresSupportTicketEffectDraftStore(db);
    const payloadJson = JSON.stringify({ version: "support-qa-ticket-ai-draft-v1", effectType: "ticket_ai_update" });
    const input = {
      id: "draft_1",
      effectType: "ticket_ai_update" as const,
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      sessionId: "session_1",
      operatorLarkId: "ou_1",
      actionRunId: "action_1",
      permissionProfileId: "support-qa.document.v1",
      snapshotVersion: 2,
      payloadJson,
      payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
    };

    await expect(store.create(input)).resolves.toMatchObject({ id: "draft_1", status: "pending" });
    await expect(store.create({ ...input, id: "draft_duplicate" })).resolves.toMatchObject({ id: "draft_1" });
    await expect(store.transition({ id: "draft_1", from: ["pending"], to: "executing" })).resolves.toMatchObject({ status: "executing" });
    await expect(store.transition({ id: "draft_1", from: ["pending"], to: "completed" })).resolves.toBeUndefined();
    await expect(store.list({ operatorLarkId: "ou_1", baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" }))
      .resolves.toEqual([expect.objectContaining({ id: "draft_1", status: "executing" })]);
    await expect(store.list({ operatorLarkId: "ou_other", baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" }))
      .resolves.toEqual([]);
  });
});
