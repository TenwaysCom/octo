import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import {
  MEEGLE_PRODUCTION_BUG_API_NAME,
  MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY,
} from "../../domain/meegle-workitem-types.js";

type RelationField = "sprint" | "version" | "bugs";
type RelationValues = Partial<Record<RelationField, string | string[]>>;

export interface MeegleCleaningWarning {
  errorCode: "MEEGLE_SYSTEM_REGION_UNRECOGNIZED" | "MEEGLE_TIME_INVALID";
  fieldKey: string;
  rawValue: unknown;
}

export interface MeegleSystemRegionProjection {
  present: boolean;
  value?: "eu" | "us" | "uk" | null;
  warnings: MeegleCleaningWarning[];
}

export interface MeegleSprintRelation {
  present: boolean;
  sprintId?: string;
  sprintName?: string;
}

const RELATION_FIELD_MAPPING: Record<string, Partial<Record<RelationField, string>>> = {
  story: {
    sprint: "field_feb079",
    version: "field_1b9eb0",
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
  },
};

const SYSTEM_FIELD_MAPPING: Record<string, { primary: string; fallback?: string }> = {
  story: { primary: "field_0dba3a", fallback: "field_00f541" },
  techtask: { primary: "field_6da66b" },
  "66700acbf297a8f821b4b860": { primary: "field_6da66b" },
  [MEEGLE_PRODUCTION_BUG_API_NAME]: { primary: "field_4976fc" },
  [MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY]: { primary: "field_4976fc" },
};

const TEAM_FIELD_MAPPING: Record<string, string> = {
  techtask: "field_7c2f56",
  "66700acbf297a8f821b4b860": "field_7c2f56",
  [MEEGLE_PRODUCTION_BUG_API_NAME]: "field_26ef68",
  [MEEGLE_PRODUCTION_BUG_WORKITEM_TYPE_KEY]: "field_26ef68",
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

export function getMeegleCleaningFieldKeys(workItemTypeKey: string): string[] {
  const teamFieldKey = TEAM_FIELD_MAPPING[workItemTypeKey];
  const systemFields = SYSTEM_FIELD_MAPPING[workItemTypeKey];
  return [...new Set([
    ...Object.values(RELATION_FIELD_MAPPING[workItemTypeKey] ?? {}),
    ...(systemFields ? [systemFields.primary, systemFields.fallback].filter((value): value is string => Boolean(value)) : []),
    ...(teamFieldKey ? [teamFieldKey] : []),
  ])];
}

export function extractMeegleSystemRegion(workitem: MeegleWorkitem): MeegleSystemRegionProjection {
  const mapping = SYSTEM_FIELD_MAPPING[workitem.type];
  if (!mapping) return { present: false, warnings: [] };
  const values = getWorkitemFieldValues(workitem);
  const primaryRaw = values.get(mapping.primary) ?? null;
  const primaryLabel = toDisplayValue(primaryRaw);
  const primaryRegion = normalizeSystemRegion(primaryLabel);
  if (primaryRegion) return { present: true, value: primaryRegion, warnings: [] };

  const fallbackRaw = mapping.fallback ? values.get(mapping.fallback) ?? null : null;
  const fallbackLabel = toDisplayValue(fallbackRaw);
  const fallbackRegion = normalizeSystemRegion(fallbackLabel);
  if (fallbackRegion) return { present: true, value: fallbackRegion, warnings: [] };

  const rawValues = [primaryLabel, fallbackLabel].flatMap((value) => (
    Array.isArray(value) ? value : value ? [value] : []
  ));
  return {
    present: true,
    value: null,
    warnings: rawValues.length === 0 ? [] : [{
      errorCode: "MEEGLE_SYSTEM_REGION_UNRECOGNIZED",
      fieldKey: mapping.fallback ? `${mapping.primary}|${mapping.fallback}` : mapping.primary,
      rawValue: rawValues,
    }],
  };
}

export function getMeegleRelationFieldKey(workItemTypeKey: string, field: RelationField): string | undefined {
  return RELATION_FIELD_MAPPING[workItemTypeKey]?.[field];
}

export function extractMeegleSprintRelation(workitem: MeegleWorkitem): MeegleSprintRelation {
  const fieldKey = getMeegleRelationFieldKey(workitem.type, "sprint");
  if (!fieldKey) return { present: false };
  const container = asRecord(workitem.fields);
  const rawFields = container?.work_item_fields ?? container?.fields;
  if (!Array.isArray(rawFields)) return { present: false };
  const fields = rawFields.map(asRecord).filter(isRecord);
  const field = fields.find((candidate) => stringValue(candidate.key ?? candidate.field_key) === fieldKey);
  if (!field) return { present: true };
  const value = field?.value ?? field?.field_value;
  const first = Array.isArray(value) ? value[0] : value;
  const record = asRecord(first);
  const sprintId = stringValue(record?.id ?? record?.key) || undefined;
  const sprintName = stringValue(record?.name ?? record?.label) || undefined;
  return {
    present: true,
    ...(sprintId ? { sprintId } : {}),
    ...(sprintName ? { sprintName } : {}),
  };
}

function toDisplayValue(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(toSingleDisplayValue).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values : undefined;
  }
  return toSingleDisplayValue(value);
}

function toSingleDisplayValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const record = asRecord(value);
  const direct = stringValue(record?.name) || stringValue(record?.label);
  if (direct) return direct;
  const cascade = asRecord(record?.cascade_key_label_value);
  if (cascade) {
    const labels = [stringValue(cascade.label), ...extractCascadeLabels(cascade.children)].filter(Boolean);
    return labels.join("/") || undefined;
  }
  return undefined;
}

function getWorkitemFieldValues(workitem: MeegleWorkitem): Map<string, unknown> {
  const container = asRecord(workitem.fields);
  const rawFields = container?.work_item_fields ?? container?.fields;
  const fields = Array.isArray(rawFields) ? rawFields.map(asRecord).filter(isRecord) : [];
  return new Map(fields.map((field) => [
    stringValue(field.key ?? field.field_key),
    Object.prototype.hasOwnProperty.call(field, "value") ? field.value : field.field_value,
  ]));
}

function normalizeSystemRegion(value: string | string[] | undefined): "eu" | "us" | "uk" | undefined {
  const labels = Array.isArray(value) ? value : value ? [value] : [];
  for (const label of labels) {
    if (!/\b(?:odoo|portal)\b/i.test(label)) continue;
    const region = label.match(/(?:^|[\s/_-])(eu|us|uk)(?:$|[\s/_-])/i)?.[1]?.toLocaleLowerCase();
    if (region === "eu" || region === "us" || region === "uk") return region;
  }
  return undefined;
}

function extractCascadeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((child) => {
    const record = asRecord(child);
    if (!record) return [];
    return [stringValue(record.label), ...extractCascadeLabels(record.children)].filter(Boolean);
  });
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
