import { buildAuthenticatedLarkClient, type AuthenticatedLarkClientFactoryDeps } from "../../application/services/lark-auth-client.factory.js";
import type { LarkBitableRecord } from "../../adapters/lark/lark-client.js";
import {
  executeLarkBaseWorkflow,
  type LarkBaseWorkflowError,
} from "./lark-base-workflow.service.js";
import type {
  CreateLarkBaseBulkWorkflowRequest,
  PreviewLarkBaseBulkWorkflowRequest,
} from "./lark-base-workflow.dto.js";

const DEFAULT_PAGE_SIZE = 500;
const MEEGLE_LINK_FIELD_NAMES = ["meegle链接", "Meegle Link", "meegleLink"];
const PRIORITY_FIELD_NAMES = ["Priority", "优先级"];
const TITLE_FIELD_NAMES = ["Issue Description", "标题", "Title", "Details Description"];

export interface LarkBaseBulkPreviewRecord {
  recordId: string;
  title: string;
  priority: string;
}

export interface LarkBaseBulkSkippedRecord extends LarkBaseBulkPreviewRecord {
  reason: "ALREADY_LINKED";
}

export interface LarkBaseBulkCreatedRecord extends LarkBaseBulkPreviewRecord {
  workitemId: string;
  meegleLink: string;
}

export interface LarkBaseBulkFailedRecord extends LarkBaseBulkPreviewRecord {
  errorCode: string;
  errorMessage: string;
}

export interface LarkBaseBulkPreviewResult {
  ok: true;
  baseId: string;
  tableId: string;
  viewId: string;
  totalRecordsInView: number;
  eligibleRecords: LarkBaseBulkPreviewRecord[];
  skippedRecords: LarkBaseBulkSkippedRecord[];
}

export interface LarkBaseBulkExecuteResult {
  ok: true;
  baseId: string;
  tableId: string;
  viewId: string;
  totalRecordsInView: number;
  summary: {
    created: number;
    failed: number;
    skipped: number;
  };
  createdRecords: LarkBaseBulkCreatedRecord[];
  failedRecords: LarkBaseBulkFailedRecord[];
  skippedRecords: LarkBaseBulkSkippedRecord[];
}

export interface LarkBaseBulkWorkflowError {
  ok: false;
  error: {
    errorCode: "INVALID_REQUEST" | "LARK_API_ERROR" | "UPDATE_FAILED";
    errorMessage: string;
  };
}

export interface LarkBaseBulkWorkflowDeps
  extends AuthenticatedLarkClientFactoryDeps {
  executeLarkBaseWorkflow?: typeof executeLarkBaseWorkflow;
}

interface ClassifiedRecords {
  eligibleRecords: LarkBaseBulkPreviewRecord[];
  skippedRecords: LarkBaseBulkSkippedRecord[];
}

export async function previewLarkBaseBulkWorkflow(
  input: PreviewLarkBaseBulkWorkflowRequest,
  deps: LarkBaseBulkWorkflowDeps = {},
): Promise<LarkBaseBulkPreviewResult | LarkBaseBulkWorkflowError> {
  try {
    const records = await listAllRecordsByView(input, deps);
    const classified = classifyRecords(records);

    return {
      ok: true,
      baseId: input.baseId,
      tableId: input.tableId,
      viewId: input.viewId,
      totalRecordsInView: records.length,
      eligibleRecords: classified.eligibleRecords,
      skippedRecords: classified.skippedRecords,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        errorCode: "LARK_API_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function executeLarkBaseBulkWorkflow(
  input: CreateLarkBaseBulkWorkflowRequest,
  deps: LarkBaseBulkWorkflowDeps = {},
): Promise<LarkBaseBulkExecuteResult | LarkBaseBulkWorkflowError> {
  const preview = await previewLarkBaseBulkWorkflow(input, deps);
  if (!preview.ok) {
    return preview;
  }

  const createdRecords: LarkBaseBulkCreatedRecord[] = [];
  const failedRecords: LarkBaseBulkFailedRecord[] = [];

  for (const record of preview.eligibleRecords) {
    try {
      const result = await (deps.executeLarkBaseWorkflow ?? executeLarkBaseWorkflow)(
        {
          baseId: input.baseId,
          tableId: input.tableId,
          recordId: record.recordId,
          masterUserId: input.masterUserId,
        },
        deps,
      );

      if (result.ok) {
        createdRecords.push({
          recordId: record.recordId,
          title: record.title,
          priority: record.priority,
          workitemId: result.workitemId,
          meegleLink: result.meegleLink,
        });
        continue;
      }

      failedRecords.push(toFailedRecord(record, result));
    } catch (error) {
      failedRecords.push({
        recordId: record.recordId,
        title: record.title,
        priority: record.priority,
        errorCode: "UPDATE_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    baseId: input.baseId,
    tableId: input.tableId,
    viewId: input.viewId,
    totalRecordsInView: preview.totalRecordsInView,
    summary: {
      created: createdRecords.length,
      failed: failedRecords.length,
      skipped: preview.skippedRecords.length,
    },
    createdRecords,
    failedRecords,
    skippedRecords: preview.skippedRecords,
  };
}

async function listAllRecordsByView(
  input: PreviewLarkBaseBulkWorkflowRequest,
  deps: LarkBaseBulkWorkflowDeps,
): Promise<LarkBitableRecord[]> {
  const { client } = await buildAuthenticatedLarkClient(
    input.masterUserId,
    "https://open.larksuite.com",
    deps,
  );
  const records: LarkBitableRecord[] = [];
  let pageToken: string | undefined;

  do {
    const page = await client.listRecordsByView(
      input.baseId,
      input.tableId,
      input.viewId,
      {
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken,
      },
    );
    records.push(...page.records);
    pageToken = page.hasMore ? page.nextPageToken : undefined;
  } while (pageToken);

  return records;
}

function classifyRecords(records: LarkBitableRecord[]): ClassifiedRecords {
  const eligibleRecords: LarkBaseBulkPreviewRecord[] = [];
  const skippedRecords: LarkBaseBulkSkippedRecord[] = [];

  for (const record of records) {
    const previewRecord = {
      recordId: record.record_id,
      title: extractTitle(record),
      priority: extractPriority(record),
    };

    if (hasMeegleLink(record)) {
      skippedRecords.push({
        ...previewRecord,
        reason: "ALREADY_LINKED",
      });
      continue;
    }

    eligibleRecords.push(previewRecord);
  }

  return { eligibleRecords, skippedRecords };
}

function hasMeegleLink(record: LarkBitableRecord): boolean {
  return MEEGLE_LINK_FIELD_NAMES.some((fieldName) => {
    const value = stringifyFieldValue(record.fields[fieldName]);
    return value.trim().length > 0;
  });
}

function extractTitle(record: LarkBitableRecord): string {
  for (const fieldName of TITLE_FIELD_NAMES) {
    const value = stringifyFieldValue(record.fields[fieldName]).trim();
    if (value) {
      return value.split("\n")[0].slice(0, 200);
    }
  }

  return `Lark Base Record ${record.record_id}`;
}

function extractPriority(record: LarkBitableRecord): string {
  for (const fieldName of PRIORITY_FIELD_NAMES) {
    const value = stringifyFieldValue(record.fields[fieldName]).trim();
    if (value) {
      return value;
    }
  }

  return "-";
}

function stringifyFieldValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyFieldValue(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    const recordValue = value as Record<string, unknown>;
    return String(
      recordValue.text ??
        recordValue.name ??
        recordValue.label ??
        recordValue.value ??
        "",
    );
  }

  return "";
}

function toFailedRecord(
  record: LarkBaseBulkPreviewRecord,
  result: LarkBaseWorkflowError,
): LarkBaseBulkFailedRecord {
  return {
    recordId: record.recordId,
    title: record.title,
    priority: record.priority,
    errorCode: result.error.errorCode,
    errorMessage: result.error.errorMessage,
  };
}
