import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  formatMeegleCurrentOwners,
  MEEGLE_CURRENT_OWNER_FIELD_KEY,
  parseWorkitemOperationRecord,
  type MeegleSyncMapping,
  type MeegleWorkitem,
  type MeegleWorkitemOperationRecord,
} from "./meegle-client.js";
import { resolveMeegleSourceUpdatedAt } from "./meegle-source-updated-at.js";
import { normalizeTimestamp } from "../../utils/normalize-timestamp.js";

const execFileAsync = promisify(execFile);
const MAX_MQL_PAGES = 100;
const MAX_MQL_PAGE_SIZE = 50;
const MAX_OPERATION_RECORD_PAGES = 100;

export type RunMeegleCommand = (args: string[]) => Promise<string>;

interface ShellProject {
  name?: unknown;
  simple_name?: unknown;
}

interface ShellWorkitemType {
  name?: unknown;
  type_key?: unknown;
}

export class MeegleShellClient {
  private readonly projectNames = new Map<string, Promise<string>>();
  private readonly workitemTypes = new Map<string, Promise<Map<string, string>>>();

  constructor(private readonly runCommand: RunMeegleCommand = runMeegleCommand) {}

  async getWorkitemDetails(
    projectKey: string,
    workitemType: string,
    workitemIds: string[],
    fieldKeys: string[] = [],
  ): Promise<MeegleWorkitem[]> {
    if (workitemIds.length === 0) {
      return [];
    }
    const data = parseRecord(await this.runCommand([
      "workitem",
      "+batch-get",
      "--project-key", projectKey,
      "--work-item-ids", workitemIds.join(","),
      ...fieldKeys.flatMap((fieldKey) => ["--fields", fieldKey]),
    ]), "meegle +batch-get response");
    const results = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((result) => {
      const item = asRecord(result);
      const detail = item ? asRecord(item.data) : undefined;
      return detail ? [toDetailedWorkitem(detail, workitemType)] : [];
    });
  }

  async filterWorkitems(
    projectKey: string,
    options: {
      workitemTypeKeys?: string[];
      pageNum?: number;
      pageSize?: number;
      autoPaginate?: boolean;
      sourceUpdatedAfter?: string;
      sourceUpdatedAtMqlFieldNames?: Record<string, string>;
    } = {},
  ): Promise<MeegleWorkitem[]> {
    const workitemTypeKeys = options.workitemTypeKeys;
    if (!workitemTypeKeys || workitemTypeKeys.length === 0) {
      throw new Error("MEEGLE_SHELL_WORK_ITEM_TYPES_REQUIRED");
    }

    const [projectName, workitemTypes] = await Promise.all([
      this.getProjectName(projectKey),
      this.getWorkitemTypes(projectKey),
    ]);
    // The local CLI's MQL endpoint caps a result page at 50 rows.
    const pageSize = Math.min(options.pageSize ?? MAX_MQL_PAGE_SIZE, MAX_MQL_PAGE_SIZE);
    const pageNum = options.pageNum ?? 1;
    const allWorkitems: MeegleWorkitem[] = [];

    for (const workitemTypeKey of workitemTypeKeys) {
      const workitemTypeName = workitemTypes.get(workitemTypeKey);
      if (!workitemTypeName) {
        throw new Error(`MEEGLE_SHELL_WORK_ITEM_TYPE_NOT_FOUND:${workitemTypeKey}`);
      }
      const sourceUpdatedAtMqlFieldName = options.sourceUpdatedAtMqlFieldNames?.[workitemTypeKey];
      if (options.sourceUpdatedAfter && !sourceUpdatedAtMqlFieldName) {
        throw new Error(`MEEGLE_SHELL_SOURCE_UPDATED_AT_FIELD_REQUIRED:${workitemTypeKey}`);
      }

      for (let currentPage = pageNum; currentPage < pageNum + MAX_MQL_PAGES; currentPage += 1) {
        const offset = (currentPage - 1) * pageSize;
        const records = await this.queryWorkitems({
          projectKey,
          projectName,
          workitemTypeName,
          offset,
          pageSize,
          sourceUpdatedAfter: options.sourceUpdatedAfter,
          sourceUpdatedAtMqlFieldName,
        });
        allWorkitems.push(...records.map((record) => toMqlWorkitem(record, workitemTypeKey, sourceUpdatedAtMqlFieldName)));
        if (!options.autoPaginate || records.length < pageSize) {
          break;
        }
        if (currentPage === pageNum + MAX_MQL_PAGES - 1) {
          throw new Error(`MEEGLE_SHELL_MQL_PAGE_LIMIT_REACHED:${workitemTypeKey}`);
        }
      }
    }

    return allWorkitems;
  }

  async getSyncMappings(projectKey: string, workitemTypeKeys: string[]): Promise<MeegleSyncMapping[]> {
    const workitemTypes = await this.getWorkitemTypes(projectKey);
    const mappings: MeegleSyncMapping[] = [];
    for (const [workItemTypeKey, workItemType] of workitemTypes) {
      mappings.push({
        projectKey,
        workItemTypeKey,
        kind: "workitem_type",
        sourceKey: workItemTypeKey,
        displayValue: workItemType,
      });
    }

    for (const workItemTypeKey of workitemTypeKeys) {
      const data = parseRecord(await this.runCommand([
        "workitem",
        "meta-fields",
        "--project-key", projectKey,
        "--work-item-type", workItemTypeKey,
        "--page-num", "1",
      ]), "meegle workitem meta-fields response");
      const statusField = (Array.isArray(data.list) ? data.list : [])
        .map(asRecord)
        .find((field) => field?.field_key === "work_item_status");
      const options = Array.isArray(statusField?.option) ? statusField.option.map(asRecord) : [];
      for (const option of options) {
        const sourceKey = stringValue(option?.option_id);
        const displayValue = stringValue(option?.option_name);
        if (sourceKey && displayValue) {
          mappings.push({ projectKey, workItemTypeKey, kind: "status", sourceKey, displayValue });
        }
      }
    }
    return mappings;
  }

  async listWorkitemOperationRecords(projectKey: string, workitemIds: string[]): Promise<MeegleWorkitemOperationRecord[]> {
    if (workitemIds.length === 0) return [];
    const records: MeegleWorkitemOperationRecord[] = [];
    let startFrom: string | undefined;
    for (let page = 0; page < MAX_OPERATION_RECORD_PAGES; page += 1) {
      const data = parseRecord(await this.runCommand([
        "workitem",
        "list-op-records",
        "--project-key", projectKey,
        "--work-item-id", workitemIds.join(","),
        "--op-record-module", "field_mod",
        "--op-record-module", "work_item_mod",
        ...(startFrom ? ["--start-from", startFrom] : []),
      ]), "meegle workitem list-op-records response");
      const pageRecords = Array.isArray(data.op_records) ? data.op_records.map(asRecord).filter(isRecord) : [];
      records.push(...pageRecords.flatMap((record) => {
        const parsed = parseWorkitemOperationRecord(record);
        return parsed ? [parsed] : [];
      }));
      if (data.has_more !== true) return records;
      startFrom = stringValue(data.start_from) || undefined;
      if (!startFrom) throw new Error("MEEGLE_OPERATION_RECORD_CURSOR_MISSING");
    }
    throw new Error("MEEGLE_OPERATION_RECORD_PAGE_LIMIT_REACHED");
  }

  private getProjectName(projectKey: string): Promise<string> {
    let projectName = this.projectNames.get(projectKey);
    if (!projectName) {
      projectName = this.runCommand(["project", "search", "--project-key", projectKey])
        .then((stdout) => {
          const data = parseRecord(stdout, "meegle project search response");
          const projects = Array.isArray(data.projects) ? data.projects : [];
          const project = projects.map(asRecord).find((item) => item && item.simple_name === projectKey);
          if (!project || typeof project.name !== "string" || project.name.length === 0) {
            throw new Error(`MEEGLE_SHELL_PROJECT_NOT_FOUND:${projectKey}`);
          }
          return project.name;
        });
      this.projectNames.set(projectKey, projectName);
    }
    return projectName;
  }

  private getWorkitemTypes(projectKey: string): Promise<Map<string, string>> {
    let workitemTypes = this.workitemTypes.get(projectKey);
    if (!workitemTypes) {
      workitemTypes = this.runCommand(["workitem", "meta-types", "--project-key", projectKey])
        .then((stdout) => {
          const data = parseRecord(stdout, "meegle workitem meta-types response");
          const types = Array.isArray(data.list) ? data.list : [];
          const result = new Map<string, string>();
          for (const type of types.map(asRecord)) {
            if (type && typeof type.type_key === "string" && typeof type.name === "string") {
              result.set(type.type_key, type.name);
            }
          }
          return result;
        });
      this.workitemTypes.set(projectKey, workitemTypes);
    }
    return workitemTypes;
  }

  private async queryWorkitems(input: {
    projectKey: string;
    projectName: string;
    workitemTypeName: string;
    offset: number;
    pageSize: number;
    sourceUpdatedAfter?: string;
    sourceUpdatedAtMqlFieldName?: string;
  }): Promise<Record<string, unknown>[]> {
    const columns = [
      "work_item_id",
      "name",
      "work_item_type_key",
      "work_item_status",
      MEEGLE_CURRENT_OWNER_FIELD_KEY,
    ];
    if (input.sourceUpdatedAtMqlFieldName) columns.push(input.sourceUpdatedAtMqlFieldName);
    const mql = [
      `SELECT ${columns.map(quoteMqlIdentifier).join(", ")}`,
      `FROM ${quoteMqlIdentifier(input.projectName)}.${quoteMqlIdentifier(input.workitemTypeName)}`,
      input.sourceUpdatedAfter && input.sourceUpdatedAtMqlFieldName
        ? `WHERE ${quoteMqlIdentifier(input.sourceUpdatedAtMqlFieldName)} >= ${quoteMqlString(input.sourceUpdatedAfter)}`
        : "",
      input.sourceUpdatedAtMqlFieldName ? `ORDER BY ${quoteMqlIdentifier(input.sourceUpdatedAtMqlFieldName)} ASC, \`work_item_id\` ASC` : "",
      `LIMIT ${input.offset}, ${input.pageSize}`,
    ].filter(Boolean).join(" ");
    const data = parseRecord(await this.runCommand([
      "workitem",
      "query",
      "--project-key", input.projectKey,
      "--mql", mql,
    ]), "meegle workitem query response");
    const groups = asRecord(data.data);
    if (!groups) {
      return [];
    }
    return Object.values(groups).flatMap((group) => (
      Array.isArray(group) ? group.map(asRecord).filter(isRecord) : []
    ));
  }
}

async function runMeegleCommand(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("meegle", [...args, "--format", "json"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function toMqlWorkitem(
  record: Record<string, unknown>,
  fallbackType: string,
  sourceUpdatedAtMqlFieldName?: string,
): MeegleWorkitem {
  const fields = Array.isArray(record.moql_field_list) ? record.moql_field_list.map(asRecord).filter(isRecord) : [];
  const fieldValues = new Map(fields.map((field) => [field.key, getMqlValue(field.value)]));
  const id = fieldValues.get("work_item_id");
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("MEEGLE_SHELL_WORK_ITEM_ID_MISSING");
  }
  const type = getMqlKeyLabel(fields.find((field) => field.key === "work_item_type_key")?.value);
  const status = getMqlKeyLabel(fields.find((field) => field.key === "work_item_status")?.value);
  const assignee = formatMeegleCurrentOwners(
    fields.find((field) => field.key === MEEGLE_CURRENT_OWNER_FIELD_KEY)?.value,
  );
  return {
    id,
    key: "",
    name: stringValue(fieldValues.get("name")),
    type: type.key || stringValue(fieldValues.get("work_item_type_key")) || fallbackType,
    workItemType: type.label || undefined,
    status: status.label || stringValue(fieldValues.get("work_item_status")),
    statusKey: status.key || undefined,
    ...(assignee ? { assignee } : {}),
    updatedAt: sourceUpdatedAtMqlFieldName
      ? normalizeTimestamp(fieldValues.get(sourceUpdatedAtMqlFieldName))
      : undefined,
    fields: { mql: record },
  };
}

function toDetailedWorkitem(data: Record<string, unknown>, fallbackType: string): MeegleWorkitem {
  const attribute = asRecord(data.work_item_attribute);
  const type = asRecord(attribute?.work_item_type);
  const status = asRecord(attribute?.work_item_status);
  const nodes = Array.isArray(data.work_item_current_node) ? data.work_item_current_node.map(asRecord).filter(isRecord) : [];
  const workitemFields = Array.isArray(data.work_item_fields)
    ? data.work_item_fields.map(asRecord).filter(isRecord)
    : [];
  const currentOwnerField = workitemFields.find((field) => (
    field.key === MEEGLE_CURRENT_OWNER_FIELD_KEY || field.field_key === MEEGLE_CURRENT_OWNER_FIELD_KEY
  ));
  const id = stringValue(attribute?.work_item_id);
  if (!id) {
    throw new Error("MEEGLE_SHELL_WORK_ITEM_ID_MISSING");
  }
  const workItemType = stringValue(type?.name);
  const statusKey = stringValue(status?.key);
  const subStage = stringValue(nodes[0]?.name);
  const subStageKey = stringValue(nodes[0]?.id);
  const assignee = formatMeegleCurrentOwners(
    currentOwnerField
      ? (Object.prototype.hasOwnProperty.call(currentOwnerField, "value")
          ? currentOwnerField.value
          : currentOwnerField.field_value)
      : data[MEEGLE_CURRENT_OWNER_FIELD_KEY],
  );
  const priority = stringValue(data.priority);
  const workItemTypeKey = stringValue(type?.key) || fallbackType;
  const updatedAt = resolveMeegleSourceUpdatedAt({
    workItemTypeKey,
    fields: data,
    updatedAt: data.updated_at ?? data.updatedAt,
  });
  return {
    id,
    key: "",
    name: stringValue(attribute?.work_item_name),
    type: workItemTypeKey,
    ...(workItemType ? { workItemType } : {}),
    status: stringValue(status?.name),
    ...(statusKey ? { statusKey } : {}),
    ...(subStage ? { subStage } : {}),
    ...(subStageKey ? { subStageKey } : {}),
    ...(assignee ? { assignee } : {}),
    ...(priority ? { priority } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    fields: data,
  };
}

function getMqlKeyLabel(value: unknown): { key: string; label: string } {
  const data = asRecord(value);
  const single = asRecord(data?.key_label_value);
  if (single) {
    return { key: stringValue(single.key), label: stringValue(single.label) };
  }
  const first = Array.isArray(data?.key_label_value_list) ? asRecord(data.key_label_value_list[0]) : undefined;
  return { key: stringValue(first?.key), label: stringValue(first?.label) };
}

function getMqlValue(value: unknown): string {
  const data = asRecord(value);
  if (!data) {
    return "";
  }
  if (typeof data.long_value === "number" || typeof data.long_value === "string") {
    return String(data.long_value);
  }
  if (typeof data.string_value === "string") {
    return data.string_value;
  }
  const keyLabelValue = asRecord(data.key_label_value);
  if (typeof keyLabelValue?.key === "string") {
    return keyLabelValue.key;
  }
  const keyLabelValueList = Array.isArray(data.key_label_value_list)
    ? data.key_label_value_list.map(asRecord).filter(isRecord)
    : [];
  return keyLabelValueList.map((item) => stringValue(item.label) || stringValue(item.key)).filter(Boolean).join(", ");
}

function quoteMqlIdentifier(value: string): string {
  return `\`${value.replaceAll("`", "``")}\``;
}

function quoteMqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseRecord(stdout: string, description: string): Record<string, unknown> {
  try {
    const data = JSON.parse(stdout) as unknown;
    if (!isRecord(data)) {
      throw new Error("not an object");
    }
    return data;
  } catch (error) {
    throw new Error(`${description} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
