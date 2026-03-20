import {
  validateExecutionDraft,
  type ExecutionDraft,
} from "../../validators/agent-output/execution-draft";

export interface A2Record {
  recordId: string;
  title: string;
  summary: string;
  target: string;
  acceptance: string;
  priority: "high" | "medium" | "low";
}

export interface A2WorkflowDeps {
  loadRecord?: (recordId: string) => Promise<A2Record>;
  createWorkitem?: (draft: ExecutionDraft) => Promise<{ workitemId: string }>;
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
    record,
    suggestion: "b1_candidate" as const,
    missingFields: [],
  };
}

export async function createB1Draft(
  input: { recordId: string },
  deps: A2WorkflowDeps = {},
): Promise<ExecutionDraft> {
  const analysis = await analyzeA2(input, deps);

  return validateExecutionDraft({
    draftType: "b1",
    needConfirm: true,
    sourceRecordId: analysis.record.recordId,
    title: analysis.record.title,
    summary: analysis.record.summary,
    projectKey: "OPS",
    workitemTypeKey: "requirement",
    templateId: "requirement-default",
    fieldValuePairs: [
      {
        fieldKey: "priority",
        value: analysis.record.priority,
        label: "优先级",
      },
      {
        fieldKey: "target",
        value: analysis.record.target,
        label: "目标",
      },
      {
        fieldKey: "acceptance",
        value: analysis.record.acceptance,
        label: "验收标准",
      },
    ],
    descriptionSections: [
      {
        title: "需求背景",
        content: analysis.record.summary,
      },
      {
        title: "验收标准",
        content: analysis.record.acceptance,
      },
    ],
  });
}

export async function applyB1(
  input: { draft: ExecutionDraft },
  deps: A2WorkflowDeps = {},
) {
  const draft = validateExecutionDraft(input.draft);
  const created =
    (await deps.createWorkitem?.(draft)) ?? ({ workitemId: "B1-001" } as const);

  return {
    status: "created" as const,
    workitemId: created.workitemId,
    draft,
  };
}

export async function executeA2ToB1Flow(
  input: { recordId: string },
  deps: A2WorkflowDeps = {},
) {
  const draft = await createB1Draft(input, deps);
  return applyB1({ draft }, deps);
}
