import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import { isMeegleSprintType } from "../../domain/meegle-workitem-types.js";
import { normalizeTimestamp } from "../../utils/normalize-timestamp.js";

export interface MeegleWorkitemLifecycle {
  phase: MeegleLifecyclePhase;
  addToCycleTime?: string;
  currentNodeStartTime?: string | null;
  itemStartTime?: string | null;
  itemFinishTime?: string | null;
}

export type MeegleLifecyclePhase = "new" | "started" | "finished";

const NEW_STATUS_MARKERS = ["new", "start", "to start", "planned", "backlog", "feature draft"];
const FINISHED_STATUS_MARKERS = ["done", "fixed", "ended", "finished", "completed"];
const LIFECYCLE_FIELD_KEYS = ["start_time", "finish_time"];

export function getMeegleWorkitemLifecycleFieldKeys(workItemTypeKey: string): string[] {
  return isMeegleSprintType(workItemTypeKey) ? [] : [...LIFECYCLE_FIELD_KEYS];
}

export function classifyMeegleLifecycleStatus(status: string | undefined): MeegleLifecyclePhase {
  const value = status?.trim().toLocaleLowerCase() ?? "";
  if (FINISHED_STATUS_MARKERS.includes(value)) return "finished";
  if (!value || NEW_STATUS_MARKERS.includes(value)) return "new";
  return "started";
}

export function buildMeegleWorkitemLifecycle(input: {
  workitem: MeegleWorkitem;
  sprintStartAt?: string;
}): MeegleWorkitemLifecycle {
  const createdAt = extractMeegleWorkitemFieldTime(input.workitem, "start_time");
  const sprintStartAt = normalizeTimestamp(input.sprintStartAt);
  const addToCycleTime = latestTimestamp([createdAt, sprintStartAt]);
  const storedNodes = extractStoredWorkflowNodes(input.workitem);
  const currentNodes = extractCurrentWorkflowNodes(input.workitem);
  const currentNodeStartTime = currentNodes[0]?.actualBeginTime ?? null;
  const currentNodeName = input.workitem.subStage || currentNodes[0]?.name;
  const storedFinishTime = extractMeegleWorkitemFieldTime(input.workitem, "finish_time");
  const currentPhase = currentNodeName
    ? classifyMeegleLifecycleStatus(currentNodeName)
    : storedFinishTime
      ? "finished"
      : classifyMeegleLifecycleStatus(input.workitem.status);
  if (currentPhase === "new") {
    return { phase: currentPhase, addToCycleTime, currentNodeStartTime, itemStartTime: null, itemFinishTime: null };
  }

  const nonNewNodes = storedNodes.filter((node) => classifyMeegleLifecycleStatus(node.name) !== "new");
  const itemStartTime = earliestTimestamp(nonNewNodes.map((node) => node.actualBeginTime));
  if (currentPhase === "started") {
    return { phase: currentPhase, addToCycleTime, currentNodeStartTime, itemStartTime: itemStartTime ?? null, itemFinishTime: null };
  }

  const terminalFinishTime = latestTimestamp(storedNodes
    .filter((node) => classifyMeegleLifecycleStatus(node.name) === "finished")
    .map((node) => node.actualFinishTime ?? node.actualBeginTime));
  return {
    phase: currentPhase,
    addToCycleTime,
    currentNodeStartTime,
    itemStartTime: itemStartTime ?? null,
    itemFinishTime: storedFinishTime ?? terminalFinishTime ?? null,
  };
}

interface StoredWorkflowNode {
  name: string;
  actualBeginTime?: string;
  actualFinishTime?: string;
}

function extractStoredWorkflowNodes(workitem: MeegleWorkitem): StoredWorkflowNode[] {
  const container = asRecord(workitem.fields);
  if (!container) return [];
  const candidates = [
    container.workflow_nodes,
    container.workflowNodes,
    container.nodes,
    container.list,
    container.work_item_current_node,
  ];
  return candidates.flatMap((value) => parseStoredWorkflowNodes(value));
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
    const actualFinishTime = normalizeTimestamp(schedule.actual_finish_time ?? schedule.actualFinishTime);
    return [{
      name,
      ...(actualBeginTime ? { actualBeginTime } : {}),
      ...(actualFinishTime ? { actualFinishTime } : {}),
    }];
  });
}

export function extractMeegleWorkitemFieldTime(
  workitem: MeegleWorkitem,
  fieldKey: "start_time" | "finish_time",
): string | undefined {
  const container = asRecord(workitem.fields);
  const rawFields = container?.work_item_fields ?? container?.fields;
  const fields = Array.isArray(rawFields) ? rawFields.map(asRecord).filter(isRecord) : [];
  const field = fields.find((candidate) => stringValue(candidate.key ?? candidate.field_key) === fieldKey);
  const value = field?.value ?? field?.field_value;
  const record = asRecord(value);
  const normalized = normalizeTimestamp(record?.iso_time ?? record?.timestamp ?? record?.time ?? value);
  if (normalized) return normalized;

  if (fieldKey === "start_time") {
    const attributes = asRecord(container?.work_item_attribute);
    return normalizeTimestamp(attributes?.create_time ?? attributes?.created_at ?? container?.created_at);
  }
  return undefined;
}

function earliestTimestamp(values: Array<string | undefined>): string | undefined {
  const normalized = values.map(normalizeTimestamp).filter((value): value is string => value !== undefined);
  return normalized.length ? normalized.sort()[0] : undefined;
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
