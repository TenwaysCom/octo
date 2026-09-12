import { executeLarkBaseWorkflow } from "../../modules/lark-base/lark-base-workflow.service.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "./lark-auth-client.factory.js";
import { buildLarkTicketCleaningProjection } from "./lark-ticket-cleaning.js";
import { PlatformSyncService } from "./platform-sync.service.js";
import {
  LARK_TICKET_FIELD_CANDIDATES,
  LARK_TICKET_TITLE_FIELD_CANDIDATES,
  type LarkTicketSemanticField,
} from "../../domain/lark-ticket-fields.js";
import type {
  LarkBitableField,
  LarkBitableRecord,
} from "../../adapters/lark/lark-client.js";
import type { PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PostgresPlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { logger } from "../../logger.js";
import {
  createActionErrorEnvelopeFromError,
  type ActionErrorEnvelope,
} from "../../application/action-error-envelope.js";

const serviceLogger = logger.child({ module: "lark-ticket-field-update-service" });
const MODULE = "lark-ticket-field-update";

// Lark bitable field type ids (open API): 3 = single select, 4 = multi select, 11 = user.
const LARK_FIELD_TYPE_SINGLE_SELECT = 3;
const LARK_FIELD_TYPE_MULTI_SELECT = 4;
const LARK_FIELD_TYPE_USER = 11;

// Upper bound for person aggregation so the options call stays bounded even if
// the synced table grows; person rosters only need to cover active tickets.
const PERSON_OPTIONS_SCAN_LIMIT = 1000;

const SELECT_SEMANTIC_FIELDS = ["status", "issueType", "priority", "businessLine"] as const;
const USER_SEMANTIC_FIELDS = ["requester", "responsible"] as const;

export class LarkTicketFieldUpdateError extends Error {
  constructor(
    readonly code:
      | "LARK_TICKET_FIELD_NOT_FOUND"
      | "LARK_TICKET_USER_ID_REQUIRED"
      | "LARK_AUTH_REQUIRED"
      | "LARK_API_ERROR",
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LarkTicketFieldUpdateError";
  }
}

export interface UpdateLarkTicketFieldRequest {
  masterUserId: string;
  larkBaseUrl?: string;
  baseId: string;
  tableId: string;
  recordId: string;
  field: LarkTicketSemanticField;
  value: string;
  optionUserId?: string;
  actionRunId?: string;
}

export interface UpdatedLarkTicketProjection {
  baseId: string;
  tableId: string;
  recordId: string;
  title: string;
  ticketStatus?: string;
  issueType?: string;
  businessLine?: string;
  requester?: string;
  responsible?: string;
  priority?: string;
}

export interface LarkTicketFieldUpdateResult {
  ok: true;
  actionRunId?: string;
  larkBaseUpdated: true;
  recordId: string;
  field: LarkTicketSemanticField;
  /** Fresh projection after the single-ticket re-sync; undefined when the re-sync failed. */
  ticket?: UpdatedLarkTicketProjection;
  syncFailed?: boolean;
}

export interface LarkTicketFieldUpdateFailure {
  ok: false;
  error: ActionErrorEnvelope;
}

export interface LarkTicketFieldOptionItem {
  label: string;
  userId?: string;
}

export interface LarkTicketFieldOptionsItem {
  field: LarkTicketSemanticField;
  kind: "select" | "user";
  options: LarkTicketFieldOptionItem[];
}

export interface LarkTicketFieldOptionsResult {
  baseId: string;
  tableId: string;
  fields: LarkTicketFieldOptionsItem[];
}

export interface LarkTicketFieldUpdateDeps extends AuthenticatedLarkClientFactoryDeps {
  syncStore?: Pick<PlatformSyncStore, "listLarkBaseTickets">;
  syncLarkBaseTicket?: (input: {
    masterUserId: string;
    larkBaseUrl?: string;
    baseId: string;
    tableId: string;
    recordId: string;
    actionRunId?: string;
    cleanAfterSync: true;
  }) => Promise<unknown>;
}

function isUserField(field: LarkBitableField | undefined): boolean {
  return field?.type === LARK_FIELD_TYPE_USER || field?.ui_type === "User";
}

function isMultiSelectField(field: LarkBitableField | undefined): boolean {
  return field?.type === LARK_FIELD_TYPE_MULTI_SELECT;
}

function isSingleSelectField(field: LarkBitableField | undefined): boolean {
  return field?.type === LARK_FIELD_TYPE_SINGLE_SELECT;
}

function findFieldByName(fields: LarkBitableField[], semantic: LarkTicketSemanticField): LarkBitableField | undefined {
  const candidates = LARK_TICKET_FIELD_CANDIDATES[semantic];
  return fields.find((field) => candidates.includes(field.field_name));
}

function findRecordFieldName(record: LarkBitableRecord, semantic: LarkTicketSemanticField): string | undefined {
  const candidates = LARK_TICKET_FIELD_CANDIDATES[semantic];
  const keys = Object.keys(record.fields);
  return candidates.find((name) => keys.includes(name));
}

function buildFieldValue(
  semantic: LarkTicketSemanticField,
  field: LarkBitableField | undefined,
  value: string,
  optionUserId: string | undefined,
): unknown {
  if (isUserField(field)) {
    if (!optionUserId) {
      throw new LarkTicketFieldUpdateError(
        "LARK_TICKET_USER_ID_REQUIRED",
        `修改 ${semantic} 需要人员 openId。`,
      );
    }
    return [{ id: optionUserId }];
  }
  if (isMultiSelectField(field)) {
    return [value];
  }
  return value;
}

function readFieldText(fields: Record<string, unknown>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = fields[name];
    if (value === undefined || value === null || value === "") continue;
    const text = larkValueToText(value).trim();
    if (text) return text;
  }
  return undefined;
}

function larkValueToText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(larkValueToText).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "name", "label", "value"]) {
      if (record[key] !== undefined) return larkValueToText(record[key]);
    }
  }
  return "";
}

function buildUpdatedTicketProjection(
  baseId: string,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): UpdatedLarkTicketProjection {
  const projection = buildLarkTicketCleaningProjection(fields);
  return {
    baseId,
    tableId,
    recordId,
    title: readFieldText(fields, LARK_TICKET_TITLE_FIELD_CANDIDATES) || recordId,
    ...(projection.issueType ? { issueType: projection.issueType } : {}),
    ...(projection.businessLine ? { businessLine: projection.businessLine } : {}),
    ...(projection.requester ? { requester: projection.requester } : {}),
    ...(projection.responsible ? { responsible: projection.responsible } : {}),
    ...(projection.priority ? { priority: projection.priority } : {}),
    ticketStatus: readFieldText(fields, LARK_TICKET_FIELD_CANDIDATES.status),
  };
}

function toFailure(request: UpdateLarkTicketFieldRequest, error: unknown, stage: string): LarkTicketFieldUpdateFailure {
  const typed = error instanceof LarkTicketFieldUpdateError ? error : undefined;
  return {
    ok: false,
    error: createActionErrorEnvelopeFromError(error, {
      module: MODULE,
      stage,
      errorCode: typed?.code ?? "LARK_API_ERROR",
      errorMessage: typed?.message,
      actionRunId: request.actionRunId,
    }),
  };
}

function collectPersonOptions(items: Array<{ sourceFields?: Record<string, unknown> }>): LarkTicketFieldOptionItem[] {
  const byKey = new Map<string, LarkTicketFieldOptionItem>();
  for (const item of items) {
    const source = item.sourceFields ?? {};
    for (const semantic of USER_SEMANTIC_FIELDS) {
      const fieldName = LARK_TICKET_FIELD_CANDIDATES[semantic].find((name) => source[name] !== undefined);
      if (!fieldName) continue;
      const raw = source[fieldName];
      const entries = Array.isArray(raw) ? raw : [raw];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const label = name || id;
        if (!label) continue;
        const key = id || label;
        const existing = byKey.get(key);
        if (!existing || (!existing.userId && id)) {
          byKey.set(key, { label, ...(id ? { userId: id } : {}) });
        }
      }
    }
  }
  return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
}

export async function updateLarkTicketField(
  request: UpdateLarkTicketFieldRequest,
  deps: LarkTicketFieldUpdateDeps = {},
): Promise<LarkTicketFieldUpdateResult | LarkTicketFieldUpdateFailure> {
  const { masterUserId, larkBaseUrl, baseId, tableId, recordId, field, value, optionUserId, actionRunId } = request;
  serviceLogger.info({ actionRunId, baseId, tableId, recordId, field }, "server.workflow.started");
  try {
    const { client } = await buildAuthenticatedLarkClient(
      masterUserId,
      larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.larksuite.com",
      deps,
    );

    const record = await client.getRecord(baseId, tableId, recordId);
    const recordFieldName = findRecordFieldName(record, field);
    const tableFields = await client.getFields(baseId, tableId);
    const fieldMeta = findFieldByName(tableFields, field);
    const fieldName = recordFieldName ?? fieldMeta?.field_name;
    if (!fieldName) {
      throw new LarkTicketFieldUpdateError(
        "LARK_TICKET_FIELD_NOT_FOUND",
        `Ticket 表中未找到 ${field} 对应的字段。`,
      );
    }

    const fieldValue = buildFieldValue(field, fieldMeta, value, optionUserId);
    const updated: LarkBitableRecord = await client.updateRecord(baseId, tableId, recordId, {
      [fieldName]: fieldValue,
    });
    serviceLogger.info({ actionRunId, recordId, field, fieldName }, "server.ticket-field.write");

    const mergedFields = { ...record.fields, ...updated.fields };
    const ticket = buildUpdatedTicketProjection(baseId, tableId, recordId, mergedFields);

    try {
      const syncLarkBaseTicket = deps.syncLarkBaseTicket ?? defaultSyncLarkBaseTicket;
      await syncLarkBaseTicket({
        masterUserId,
        larkBaseUrl,
        baseId,
        tableId,
        recordId,
        actionRunId,
        cleanAfterSync: true,
      });
    } catch (syncError) {
      // Partial success: Lark Base is updated, the local projection refresh failed.
      serviceLogger.warn({
        actionRunId,
        recordId,
        field,
        message: syncError instanceof Error ? syncError.message : String(syncError),
      }, "server.ticket-field.sync_failed");
      return {
        ok: true,
        ...(actionRunId ? { actionRunId } : {}),
        larkBaseUpdated: true,
        recordId,
        field,
        syncFailed: true,
      };
    }

    serviceLogger.info({ actionRunId, recordId, field }, "server.workflow.completed");
    return {
      ok: true,
      ...(actionRunId ? { actionRunId } : {}),
      larkBaseUpdated: true,
      recordId,
      field,
      ticket,
    };
  } catch (error) {
    const typed = error instanceof LarkTicketFieldUpdateError ? error : undefined;
    serviceLogger.error({
      actionRunId,
      baseId,
      tableId,
      recordId,
      field,
      errorCode: typed?.code ?? "LARK_API_ERROR",
      message: error instanceof Error ? error.message : String(error),
    }, "server.workflow.failed");
    return toFailure(request, error, "server.workflow.failed");
  }
}

export async function getLarkTicketFieldOptions(
  request: { masterUserId: string; larkBaseUrl?: string; baseId: string; tableId: string },
  deps: LarkTicketFieldUpdateDeps = {},
): Promise<LarkTicketFieldOptionsResult> {
  const { masterUserId, larkBaseUrl, baseId, tableId } = request;
  const { client } = await buildAuthenticatedLarkClient(
    masterUserId,
    larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.larksuite.com",
    deps,
  );
  const tableFields = await client.getFields(baseId, tableId);

  const selectFields: LarkTicketFieldOptionsItem[] = SELECT_SEMANTIC_FIELDS.flatMap((field) => {
    const fieldMeta = findFieldByName(tableFields, field);
    if (!fieldMeta) return [];
    return [{
      field,
      kind: "select" as const,
      options: (fieldMeta.options ?? []).map((option) => ({ label: option.name })),
    }];
  });

  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const items = await syncStore.listLarkBaseTickets(PERSON_OPTIONS_SCAN_LIMIT);
  const personOptions = collectPersonOptions(items);
  const userFields: LarkTicketFieldOptionsItem[] = USER_SEMANTIC_FIELDS.map((field) => ({
    field,
    kind: "user" as const,
    options: personOptions,
  }));

  return { baseId, tableId, fields: [...selectFields, ...userFields] };
}

function defaultSyncLarkBaseTicket(input: {
  masterUserId: string;
  larkBaseUrl?: string;
  baseId: string;
  tableId: string;
  recordId: string;
  actionRunId?: string;
  cleanAfterSync: true;
}): Promise<unknown> {
  return new PlatformSyncService().syncLarkBaseTicket(input);
}

// Scope concurrent Web creates by the source record, independently of actionRunId.
const runningTicketCreates = new Set<string>();

export async function createLarkTicketMeegleWorkitem(
  request: Parameters<NonNullable<LarkTicketFieldUpdateDeps["syncLarkBaseTicket"]>>[0],
  deps: Pick<LarkTicketFieldUpdateDeps, "syncLarkBaseTicket"> & {
    createMeegleWorkflow?: typeof executeLarkBaseWorkflow;
  } = {},
) {
  const key = JSON.stringify([request.baseId, request.tableId, request.recordId]);
  if (runningTicketCreates.has(key)) {
    return { ok: false as const, error: {
      actionRunId: request.actionRunId,
      layer: "server" as const, module: MODULE, stage: "server.workflow.skipped",
      errorCode: "LARK_TICKET_CREATE_RUNNING", errorMessage: "此 Ticket 正在创建 Meegle 工作项，请等待完成。",
    } };
  }
  runningTicketCreates.add(key);
  try {
    const { masterUserId, baseId, tableId, recordId, actionRunId } = request;
    const result = await (deps.createMeegleWorkflow ?? executeLarkBaseWorkflow)({
      masterUserId, baseId, tableId, recordId, actionRunId,
    });
    if (!result.ok) return result;
    try {
      await (deps.syncLarkBaseTicket ?? defaultSyncLarkBaseTicket)(request);
      return { ...result, syncFailed: false };
    } catch {
      serviceLogger.warn({ actionRunId, recordId, layer: "server", module: MODULE,
        stage: "server.ticket-create.sync_failed", errorCode: "LARK_TICKET_SYNC_FAILED",
      }, "server.ticket-create.sync_failed");
      return { ...result, syncFailed: true };
    }
  } finally {
    runningTicketCreates.delete(key);
  }
}
