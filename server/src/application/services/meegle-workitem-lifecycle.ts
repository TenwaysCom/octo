import type { MeegleWorkitem, MeegleWorkitemOperationRecord } from "../../adapters/meegle/meegle-client.js";
import { extractMeegleSprintTag, getMeegleRelationFieldKey } from "./meegle-cleaning.config.js";

export interface MeegleWorkitemLifecycle {
  itemCycleTag?: string;
  addToCycleTime?: string;
  itemStartTime?: string;
  itemFinishTime?: string;
}

type LifecyclePhase = "new" | "started" | "finished";

const NEW_STATUS_MARKERS = ["new", "start", "to start", "planned", "backlog", "feature draft"];
const FINISHED_STATUS_MARKERS = ["done", "fixed", "launched", "ended", "finished", "completed"];

export function classifyMeegleLifecycleStatus(status: string | undefined): LifecyclePhase {
  const value = status?.trim().toLocaleLowerCase() ?? "";
  if (FINISHED_STATUS_MARKERS.includes(value)) return "finished";
  if (!value || NEW_STATUS_MARKERS.includes(value)) return "new";
  return "started";
}

export function buildMeegleWorkitemLifecycle(input: {
  workitem: MeegleWorkitem;
  operationRecords: MeegleWorkitemOperationRecord[];
  statusLabels?: Map<string, string>;
}): MeegleWorkitemLifecycle {
  const itemCycleTag = extractMeegleSprintTag(input.workitem);
  if (!itemCycleTag) return {};

  const records = input.operationRecords
    .filter((record) => record.workItemId === input.workitem.id)
    .sort((left, right) => Date.parse(left.operationTime) - Date.parse(right.operationTime));
  const createdAt = records.find((record) => record.operationType === "create")?.operationTime;
  const cycleFieldKey = getMeegleRelationFieldKey(input.workitem.type, "sprint");
  const addToCycleTime = records.flatMap((record) => record.recordContents.map((content) => ({ record, content })))
    .filter(({ content }) => content.objectValue === cycleFieldKey
      && content.newValues.includes(itemCycleTag)
      && !content.oldValues.includes(itemCycleTag))
    .at(-1)?.record.operationTime ?? createdAt;

  const statusEvents = uniqueStatusEvents(records.flatMap((record) => record.recordContents.flatMap((content) => {
    const isStatus = content.objectProperty === "workitem_status" || content.objectValue === "work_item_status";
    const statusKey = isStatus ? content.newValues[0] : undefined;
    if (!statusKey) return [];
    return [{
      time: record.operationTime,
      oldStatusKey: content.oldValues[0],
      statusKey,
    }];
  })));
  const statusLabel = (key: string | undefined) => key ? input.statusLabels?.get(key) ?? key : undefined;
  const initialPhase = statusEvents[0]?.oldStatusKey
    ? classifyMeegleLifecycleStatus(statusLabel(statusEvents[0].oldStatusKey))
    : classifyMeegleLifecycleStatus(input.workitem.status);
  let phase = initialPhase;
  let itemStartTime = phase === "started" || phase === "finished" ? createdAt : undefined;
  let itemFinishTime = phase === "finished" ? createdAt : undefined;

  for (const event of statusEvents) {
    const nextPhase = classifyMeegleLifecycleStatus(statusLabel(event.statusKey));
    if (nextPhase === "new") {
      itemStartTime = undefined;
      itemFinishTime = undefined;
    } else if (nextPhase === "started") {
      if (phase !== "started") itemStartTime = event.time;
      itemFinishTime = undefined;
    } else {
      if (!itemStartTime) itemStartTime = event.time;
      itemFinishTime = event.time;
    }
    phase = nextPhase;
  }

  const currentPhase = classifyMeegleLifecycleStatus(input.workitem.status);
  if (currentPhase === "new") {
    itemStartTime = undefined;
    itemFinishTime = undefined;
  } else if (currentPhase === "started") {
    itemStartTime ??= statusEvents.at(-1)?.time ?? createdAt;
    itemFinishTime = undefined;
  } else {
    itemStartTime ??= createdAt;
    itemFinishTime ??= statusEvents.at(-1)?.time ?? createdAt;
  }

  return { itemCycleTag, addToCycleTime, itemStartTime, itemFinishTime };
}

function uniqueStatusEvents<T extends { time: string; statusKey: string }>(events: T[]): T[] {
  const sorted = events.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  return [...new Map(sorted.map((event) => [`${event.time}\u0000${event.statusKey}`, event])).values()];
}
