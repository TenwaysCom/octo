import { describe, expect, it, vi } from "vitest";
import type { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import { validateExecutionDraft } from "../../validators/agent-output/execution-draft.js";
import { createWorkitemFromDraft } from "./meegle-workitem.service.js";

describe("meegle-workitem.service", () => {
  it("omits non-numeric template ids when creating workitems", async () => {
    const draft = validateExecutionDraft({
      draftId: "draft_b2_001",
      draftType: "b2",
      sourceRef: {
        sourcePlatform: "lark_a1",
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
      ownerUserKeys: [],
      missingMeta: [],
    });
    const client = {
      createWorkitem: vi.fn().mockResolvedValue({
        id: "WK-001",
        key: "OPS-BUG-001",
        name: "支付页白屏",
        type: "bug",
        status: "open",
        fields: {},
      }),
    } as unknown as MeegleClient;

    await createWorkitemFromDraft(
      draft,
      { client },
      { idempotencyKey: "idem_001" },
    );

    expect(client.createWorkitem).toHaveBeenCalledWith({
      projectKey: "OPS",
      workItemTypeKey: "bug",
      name: "支付页白屏",
      templateId: undefined,
      idempotencyKey: "idem_001",
      fieldValuePairs: [
        {
          field_key: "priority",
          field_value: "P1",
        },
      ],
    });
  });
});
