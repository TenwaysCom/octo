import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import { MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";

type RelationField = "sprint" | "version" | "system" | "bugs";
type RelationValues = Partial<Record<RelationField, string | string[]>>;

const RELATION_FIELD_MAPPING: Record<string, Partial<Record<RelationField, string>>> = {
  story: {
    sprint: "field_feb079",
    version: "field_1b9eb0",
    system: "field_00f541",
    bugs: "field_9edc03",
  },
  "66700acbf297a8f821b4b860": {
    sprint: "field_ecd063",
    version: "field_5fab52",
    bugs: "field_3daed9",
  },
  [MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY]: {
    sprint: "field_ee999e",
    version: "field_c6f6d0",
    system: "field_4976fc",
  },
};

export function extractMeegleCleaningRelations(workitem: MeegleWorkitem): RelationValues {
  const mapping = RELATION_FIELD_MAPPING[workitem.type];
  if (!mapping) return {};

  const rawFields = asRecord(workitem.fields)?.work_item_fields;
  const fields = Array.isArray(rawFields) ? rawFields : [];
  const valuesByFieldKey = new Map(fields.map(asRecord).filter(isRecord).map((field) => [stringValue(field.key), field.value]));
  const values: RelationValues = {};
  for (const [semanticField, fieldKey] of Object.entries(mapping) as Array<[RelationField, string]>) {
    const value = toDisplayValue(valuesByFieldKey.get(fieldKey));
    if (value !== undefined) values[semanticField] = value;
  }
  return values;
}

function toDisplayValue(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(toSingleDisplayValue).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values : undefined;
  }
  return toSingleDisplayValue(value);
}

function toSingleDisplayValue(value: unknown): string | undefined {
  const record = asRecord(value);
  return stringValue(record?.name) || stringValue(record?.label) || undefined;
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
