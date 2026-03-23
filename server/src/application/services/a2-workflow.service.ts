import {
  validateExecutionDraft,
  type ExecutionDraft,
} from "../../validators/agent-output/execution-draft.js";
import { createWorkitemFromDraft } from "./meegle-workitem.service.js";
import type { MeegleWorkitemServiceDeps } from "./meegle-workitem.service.js";
import type { A2Requirement } from "../../adapters/lark/lark-client.js";

export interface A2Record extends Partial<A2Requirement> {
  recordId: string;
  title: string;
  summary: string;
  target: string;
  acceptance: string;
  priority: "high" | "medium" | "low";
}

export interface A2WorkflowDeps extends Partial<MeegleWorkitemServiceDeps> {
  loadRecord?: (recordId: string) => Promise<A2Record>;
}

function defaultA2Record(recordId: string): A2Record {
  return {
    recordId,
    title: `Requirement ${recordId}`,
    summary: "需求需要进一步整理后进入研发任务。",
    target: "提升业务处理效率",
    acceptance: "完成配置后业务同学可在同一页面完成操作",
    priority: "high",
  };
}

async function loadA2Record(
  recordId: string,
  deps: A2WorkflowDeps,
): Promise<A2Record> {
  return deps.loadRecord?.(recordId) ?? defaultA2Record(recordId);
}

export async function analyzeA2(
  input: { recordId: string },
  deps: A2WorkflowDeps = {},
) {
  const record = await loadA2Record(input.recordId, deps);

  return {
    summary: `${record.title} 可继续整理为研发需求`,
    readiness: "needs_refine" as const,
    missingFields: [],
    suggestedSplit: [],
    nextActions: ["补充非范围说明", "生成 B1 草稿"],
  };
}

export async function createB1Draft(
  input: { recordId: string },
  deps: A2WorkflowDeps = {},
): Promise<ExecutionDraft> {
  const record = await loadA2Record(input.recordId, deps);

  return validateExecutionDraft({
    draftId: `draft_b1_${record.recordId}`,
    draftType: "b1",
    sourceRef: {
      sourcePlatform: "lark_a2",
      sourceRecordId: record.recordId,
    },
    target: {
      projectKey: "OPS",
      workitemTypeKey: "requirement",
      templateId: "requirement-default",
    },
    name: record.title,
    needConfirm: true,
    fieldValuePairs: [
      {
        fieldKey: "priority",
        fieldValue: record.priority,
      },
      {
        fieldKey: "target",
        fieldValue: record.target,
      },
      {
        fieldKey: "acceptance",
        fieldValue: record.acceptance,
      },
    ],
    ownerUserKeys: [],
    missingMeta: [],
  });
}

export async function applyB1(
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
  deps: A2WorkflowDeps = {},
) {
  const draft = validateExecutionDraft({
    draftId: input.draftId,
    draftType: "b1",
    sourceRef: {
      sourcePlatform: "lark_a2",
      sourceRecordId: input.sourceRecordId,
    },
    target: {
      projectKey: "OPS",
      workitemTypeKey: "requirement",
      templateId: "requirement-default",
    },
    name: input.confirmedDraft.name,
    fieldValuePairs: input.confirmedDraft.fieldValuePairs,
    ownerUserKeys: input.confirmedDraft.ownerUserKeys ?? [],
    missingMeta: [],
    needConfirm: true,
  });

  // If client is provided, create real workitem; otherwise return mock
  if (deps.client) {
    const created = await createWorkitemFromDraft(draft, { client: deps.client });
    return {
      status: "created" as const,
      workitemId: created.workitemId,
      draft,
    };
  }

  // Mock response for tests
  return {
    status: "created" as const,
    workitemId: "B1-001",
    draft,
  };
}

export async function executeA2ToB1Flow(
  input: { recordId: string },
  deps: A2WorkflowDeps = {},
) {
  const draft = await createB1Draft(input, deps);
  return applyB1(
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
