import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import {
  MEEGLE_PRODUCTION_BUG_API_NAME,
  MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY,
} from "../../domain/meegle-workitem-types.js";
import type { MeegleCleaningWarning } from "./meegle-cleaning.config.js";
import { normalizeMeegleDate } from "../../utils/meegle-source-time.js";
import { normalizeTimestamp } from "../../utils/normalize-timestamp.js";

export interface MeegleWorkitemLifecycle {
  addToCycleTime?: string;
  currentNodeStartTime?: string | null;
  itemStartTime?: string | null;
  itemFinishTime?: string | null;
  warnings?: MeegleCleaningWarning[];
}
const LIFECYCLE_FIELD_KEYS = ["start_time", "finish_time"];
const LIFECYCLE_WORKITEM_TYPES = new Set([
  "story",
  "techtask",
  "66700acbf297a8f821b4b860",
  MEEGLE_PRODUCTION_BUG_API_NAME,
  MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY,
]);

export function getMeegleWorkitemLifecycleFieldKeys(workItemTypeKey: string): string[] {
  return supportsMeegleWorkitemLifecycleCleaning(workItemTypeKey) ? [...LIFECYCLE_FIELD_KEYS] : [];
}

export function supportsMeegleWorkitemLifecycleCleaning(workItemTypeKey: string): boolean {
  return LIFECYCLE_WORKITEM_TYPES.has(workItemTypeKey);
}

export function buildMeegleWorkitemLifecycle(input: {
  workitem: MeegleWorkitem;
  sprintStartAt?: string;
}): MeegleWorkitemLifecycle {
  const start = extractMeegleWorkitemFieldDate(input.workitem, "start_time");
  const finish = extractMeegleWorkitemFieldDate(input.workitem, "finish_time");
  const sourceStartTimestamp = extractMeegleWorkitemFieldTimestamp(input.workitem, "start_time");
  const sprintStartAt = normalizeTimestamp(input.sprintStartAt);
  const addToCycleTime = latestTimestamp([sourceStartTimestamp, sprintStartAt]);
  const currentNodes = extractCurrentWorkflowNodes(input.workitem);
  const currentNodeStartTime = currentNodes[0]?.actualBeginTime ?? null;
  return {
    addToCycleTime,
    currentNodeStartTime,
    itemStartTime: start.value,
    itemFinishTime: finish.value,
    warnings: [...start.warnings, ...finish.warnings],
  };
}

interface StoredWorkflowNode {
  actualBeginTime?: string;
}

function extractCurrentWorkflowNodes(workitem: MeegleWorkitem): StoredWorkflowNode[] {
  return parseStoredWorkflowNodes(asRecord(workitem.fields)?.work_item_current_node);
}

function parseStoredWorkflowNodes(value: unknown): StoredWorkflowNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const node = asRecord(candidate);
    if (!node) return [];
    const basic = asRecord(node.basic) ?? node;
    const schedule = asRecord(node.schedule) ?? node;
    const name = stringValue(basic.name ?? node.name);
    if (!name) return [];
    const actualBeginTime = normalizeTimestamp(schedule.actual_begin_time ?? schedule.actualBeginTime);
    return [{
      ...(actualBeginTime ? { actualBeginTime } : {}),
    }];
  });
}

export function extractMeegleWorkitemFieldDate(
  workitem: MeegleWorkitem,
  fieldKey: "start_time" | "finish_time",
): { value: string | null; warnings: MeegleCleaningWarning[] } {
  const rawValue = extractMeegleWorkitemRawFieldValue(workitem, fieldKey);
  if (rawValue === undefined || rawValue === null || rawValue === "") return { value: null, warnings: [] };
  const record = asRecord(rawValue);
  const candidate = record?.iso_time ?? record?.timestamp ?? record?.time ?? rawValue;
  const normalized = normalizeMeegleDate(candidate);
  return normalized ? { value: normalized, warnings: [] } : {
    value: null,
    warnings: [{ errorCode: "MEEGLE_TIME_INVALID", fieldKey, rawValue }],
  };
}

function extractMeegleWorkitemFieldTimestamp(
  workitem: MeegleWorkitem,
  fieldKey: "start_time" | "finish_time",
): string | undefined {
  const value = extractMeegleWorkitemRawFieldValue(workitem, fieldKey);
  const record = asRecord(value);
  return normalizeTimestamp(record?.iso_time ?? record?.timestamp ?? record?.time ?? value);
}

function extractMeegleWorkitemRawFieldValue(
  workitem: MeegleWorkitem,
  fieldKey: "start_time" | "finish_time",
): unknown {
  const container = asRecord(workitem.fields);
  const rawFields = container?.work_item_fields ?? container?.fields;
  const fields = Array.isArray(rawFields) ? rawFields.map(asRecord).filter(isRecord) : [];
  const field = fields.find((candidate) => stringValue(candidate.key ?? candidate.field_key) === fieldKey);
  return field && Object.prototype.hasOwnProperty.call(field, "value") ? field.value : field?.field_value;
}

function latestTimestamp(values: Array<string | undefined>): string | undefined {
  const normalized = values.map(normalizeTimestamp).filter((value): value is string => value !== undefined);
  return normalized.length ? normalized.sort().at(-1) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
