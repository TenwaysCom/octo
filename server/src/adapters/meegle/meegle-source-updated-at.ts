import { normalizeTimestamp } from "../../utils/normalize-timestamp.js";
import { isMeegleProductionBugType, MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";

export { MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";

export function resolveMeegleSourceUpdatedAt(input: {
  workItemTypeKey: string;
  fields: Record<string, unknown>;
  updatedAt?: unknown;
}): string | undefined {
  if (isMeegleProductionBugType(input.workItemTypeKey)) {
    return normalizeTimestamp(asRecord(input.fields.work_item_attribute)?.update_time);
  }
  return normalizeTimestamp(input.updatedAt);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
