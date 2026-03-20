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
  createWorkitem?: (draft: ExecutionDraft) => Promise<{ workitemId: string }>;
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
    record,
    suggestion: "b2_candidate" as const,
    missingFields: [],
  };
}

export async function createB2Draft(
  input: { recordId: string },
  deps: A1WorkflowDeps = {},
): Promise<ExecutionDraft> {
  const analysis = await analyzeA1(input, deps);

  return validateExecutionDraft({
    draftType: "b2",
    needConfirm: true,
    sourceRecordId: analysis.record.recordId,
    title: analysis.record.title,
    summary: analysis.record.summary,
    projectKey: "OPS",
    workitemTypeKey: "bug",
    templateId: "production-bug",
    fieldValuePairs: [
      {
        fieldKey: "priority",
        value: analysis.record.priority,
        label: "优先级",
      },
      {
        fieldKey: "environment",
        value: analysis.record.environment,
        label: "环境",
      },
      {
        fieldKey: "impact",
        value: analysis.record.impact,
        label: "影响范围",
      },
    ],
    descriptionSections: [
      {
        title: "问题现象",
        content: analysis.record.summary,
      },
      {
        title: "影响范围",
        content: analysis.record.impact,
      },
    ],
  });
}

export async function applyB2(
  input: { draft: ExecutionDraft },
  deps: A1WorkflowDeps = {},
) {
  const draft = validateExecutionDraft(input.draft);
  const created =
    (await deps.createWorkitem?.(draft)) ?? ({ workitemId: "B2-001" } as const);

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
  return applyB2({ draft }, deps);
}
