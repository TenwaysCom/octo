import { describe, expect, it, vi } from "vitest";
import { MeegleAPIError } from "../../adapters/meegle/meegle-client.js";
import type { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import { validateExecutionDraft } from "../../validators/agent-output/execution-draft.js";
import { createWorkitemFromDraft } from "./meegle-workitem.service.js";

describe("meegle-workitem.service", () => {
  it("omits non-numeric template ids when creating workitems", async () => {
    const draft = validateExecutionDraft({
      draftId: "draft_b2_001",
      sourceRef: {
        sourcePlatform: "lark_base",
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

  it("retries creation without illegal fields and updates them after", async () => {
    const draft = validateExecutionDraft({
      draftId: "draft_b2_002",
      sourceRef: {
        sourcePlatform: "lark_base",
        sourceRecordId: "record_002",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "story",
        templateId: "400329",
      },
      name: "A story",
      needConfirm: true,
      fieldValuePairs: [
        {
          fieldKey: "description",
          fieldValue: "Some description",
        },
        {
          fieldKey: "priority",
          fieldValue: "P1",
        },
      ],
      ownerUserKeys: [],
      missingMeta: [],
    });

    const client = {
      createWorkitem: vi.fn()
        .mockRejectedValueOnce(
          new MeegleAPIError("HTTP 400", 400, {
            err_code: 20006,
            err_msg: "Invalid Param",
            err: { code: 20006, msg: "field [priority] is illegal" },
          }),
        )
        .mockResolvedValueOnce({
          id: "WK-002",
          key: "OPS-STORY-002",
          name: "A story",
          type: "story",
          status: "open",
          fields: {},
        }),
      updateWorkitem: vi.fn().mockResolvedValue({
        id: "WK-002",
        key: "OPS-STORY-002",
        name: "A story",
        type: "story",
        status: "open",
        fields: {},
      }),
    } as unknown as MeegleClient;

    const result = await createWorkitemFromDraft(
      draft,
      { client },
      { idempotencyKey: "idem_002" },
    );

    expect(result.workitemId).toBe("WK-002");
    expect(client.createWorkitem).toHaveBeenCalledTimes(2);
    expect(client.createWorkitem).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fieldValuePairs: [
          {
            field_key: "description",
            field_value: "Some description",
          },
        ],
      }),
    );
    expect(client.updateWorkitem).toHaveBeenCalledWith(
      "OPS",
      "story",
      "WK-002",
      [
        {
          fieldKey: "priority",
          fieldValue: "P1",
        },
      ],
    );
  });
});
