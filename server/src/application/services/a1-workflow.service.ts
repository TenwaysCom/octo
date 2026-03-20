import {
  validateExecutionDraft,
  type ExecutionDraft,
} from "../../validators/agent-output/execution-draft";

export interface A1Record {
  recordId: string;
  title: string;
  summary: string;
  impact: string;
  priority: "P0" | "P1" | "P2";
  environment: string;
}

export interface A1WorkflowDeps {
  loadRecord?: (recordId: string) => Promise<A1Record>;
  createWorkitem?: (input: {
    draft: ExecutionDraft;
    requestId: string;
    operatorLarkId: string;
    idempotencyKey: string;
  }) => Promise<{ workitemId: string }>;
}

function defaultA1Record(recordId: string): A1Record {
  return {
    recordId,
    title: `Support issue ${recordId}`,
    summary: "用户提交的支持工单需要转为产线 Bug 继续处理。",
    impact: "影响业务同学日常使用",
    priority: "P1",
    environment: "production",
  };
}

async function loadA1Record(
  recordId: string,
  deps: A1WorkflowDeps,
): Promise<A1Record> {
  return deps.loadRecord?.(recordId) ?? defaultA1Record(recordId);
}

export async function analyzeA1(
  input: { recordId: string },
  deps: A1WorkflowDeps = {},
) {
  const record = await loadA1Record(input.recordId, deps);

  return {
    summary: `${record.title} 更适合进入产线 Bug 流程`,
    decision: "to_b2" as const,
    missingFields: [],
    riskLevel: "medium" as const,
    nextActions: ["补充环境信息", "生成 B2 草稿"],
  };
}

export async function createB2Draft(
  input: { recordId: string },
  deps: A1WorkflowDeps = {},
): Promise<ExecutionDraft> {
  const record = await loadA1Record(input.recordId, deps);

  return validateExecutionDraft({
    draftId: `draft_b2_${record.recordId}`,
    draftType: "b2",
    sourceRef: {
      sourcePlatform: "lark_a1",
      sourceRecordId: record.recordId,
    },
    target: {
      projectKey: "OPS",
      workitemTypeKey: "bug",
      templateId: "production-bug",
    },
    name: record.title,
    needConfirm: true,
    fieldValuePairs: [
      {
        fieldKey: "priority",
        fieldValue: record.priority,
      },
      {
        fieldKey: "environment",
        fieldValue: record.environment,
      },
      {
        fieldKey: "impact",
        fieldValue: record.impact,
      },
    ],
    ownerUserKeys: [],
    missingMeta: [],
  });
}

export async function applyB2(
  input: {
    requestId: string;
    draftId: string;
    operatorLarkId: string;
    sourceRecordId: string;
    idempotencyKey: string;
    confirmedDraft: {
      name: string;
      fieldValuePairs: ExecutionDraft["fieldValuePairs"];
      ownerUserKeys?: string[];
    };
  },
  deps: A1WorkflowDeps = {},
) {
  const draft = validateExecutionDraft({
    draftId: input.draftId,
    draftType: "b2",
    sourceRef: {
      sourcePlatform: "lark_a1",
      sourceRecordId: input.sourceRecordId,
    },
    target: {
      projectKey: "OPS",
      workitemTypeKey: "bug",
      templateId: "production-bug",
    },
    name: input.confirmedDraft.name,
    fieldValuePairs: input.confirmedDraft.fieldValuePairs,
    ownerUserKeys: input.confirmedDraft.ownerUserKeys ?? [],
    missingMeta: [],
    needConfirm: true,
  });
  const created =
    (await deps.createWorkitem?.({
      draft,
      requestId: input.requestId,
      operatorLarkId: input.operatorLarkId,
      idempotencyKey: input.idempotencyKey,
    })) ?? ({ workitemId: "B2-001" } as const);

  return {
    status: "created" as const,
    workitemId: created.workitemId,
    draft,
  };
}

export async function executeA1ToB2Flow(
  input: { recordId: string },
  deps: A1WorkflowDeps = {},
) {
  const draft = await createB2Draft(input, deps);
  return applyB2(
    {
      requestId: `req_${input.recordId}`,
      draftId: draft.draftId,
      operatorLarkId: "ou_system",
      sourceRecordId: draft.sourceRef.sourceRecordId,
      idempotencyKey: `idem_${input.recordId}`,
      confirmedDraft: {
        name: draft.name,
        fieldValuePairs: draft.fieldValuePairs,
        ownerUserKeys: draft.ownerUserKeys,
      },
    },
    deps,
  );
}
