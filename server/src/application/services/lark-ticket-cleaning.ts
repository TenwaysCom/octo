import { LARK_TICKET_FIELD_CANDIDATES } from "../../domain/lark-ticket-fields.js";

const TICKET_NUMBER_FIELDS = ["Ticket 编号", "Ticket编号", "ticket编号", "Ticket Number", "Ticket No.", "编号"];
const ISSUE_TYPE_FIELDS = LARK_TICKET_FIELD_CANDIDATES.issueType;
const REQUESTER_FIELDS = LARK_TICKET_FIELD_CANDIDATES.requester;
const RESPONSIBLE_FIELDS = LARK_TICKET_FIELD_CANDIDATES.responsible;
const URGENCY_FIELDS = LARK_TICKET_FIELD_CANDIDATES.priority;
const BUSINESS_LINE_FIELDS = LARK_TICKET_FIELD_CANDIDATES.businessLine;
const CREATED_AT_FIELDS = ["创建时间", "Created Time", "Created At"];
const DETAIL_DESCRIPTION_FIELDS = ["Details Description", "Issue Description"];
const MEEGLE_LINK_FIELDS = ["meegle链接", "Meegle Link", "meegleLink"];
const LARK_MESSAGE_LINK_FIELDS = ["Lark Message Link", "Message Link", "Thread Link", "Chat Link", "lark_message_link"];
const LARK_MESSAGE_LINK_PATTERN = /https?:\/\/[^\s"'<>)\]]*(?:threadid|chatid|messageid)=[^\s"'<>)\]]*/i;

export interface LarkTicketCleaningProjection {
  ticketNumber?: string;
  issueType?: string;
  businessLine?: string;
  requester?: string;
  responsible?: string;
  priority?: string;
  createdAt?: string;
  closedAt?: string;
  solution?: string;
  detailDescription?: string;
  meegleLink?: string;
  larkMessageLink?: string;
}

export function buildLarkTicketCleaningProjection(
  fields: Record<string, unknown> | undefined,
  createdTime?: string,
): LarkTicketCleaningProjection {
  const source = fields ?? {};
  const detailDescription = readField(source, DETAIL_DESCRIPTION_FIELDS);
  return omitEmpty({
    ticketNumber: readField(source, TICKET_NUMBER_FIELDS),
    issueType: readField(source, ISSUE_TYPE_FIELDS),
    businessLine: readField(source, BUSINESS_LINE_FIELDS),
    requester: readField(source, REQUESTER_FIELDS),
    responsible: readField(source, RESPONSIBLE_FIELDS),
    priority: readField(source, URGENCY_FIELDS),
    createdAt: normalizeLarkTicketTimestamp(readField(source, CREATED_AT_FIELDS) ?? createdTime),
    closedAt: normalizeLarkTicketTimestamp(readField(source, ["关闭时间"])),
    solution: readField(source, ["解决方案"]),
    detailDescription,
    meegleLink: readUrl(source, MEEGLE_LINK_FIELDS),
    larkMessageLink: readUrl(source, LARK_MESSAGE_LINK_FIELDS) ?? findMessageLink(detailDescription),
  });
}

export function normalizeLarkTicketTimestamp(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  // Lark Base date values are Unix milliseconds, including legacy string values.
  const timestamp = /^\d+$/.test(text) ? Number(text) : Date.parse(text);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readField(fields: Record<string, unknown>, names: string[]): string | undefined {
  const value = names.map((name) => fields[name]).find((item) => item !== undefined && item !== null && item !== "");
  const text = valueToText(value).trim();
  return text || undefined;
}

function readUrl(fields: Record<string, unknown>, names: string[]): string | undefined {
  const text = readField(fields, names);
  if (!text) return undefined;
  return findUrl(text) ?? text;
}

function findMessageLink(text: string | undefined): string | undefined {
  return text?.match(LARK_MESSAGE_LINK_PATTERN)?.[0];
}

function findUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s"'<>)\]]+/i)?.[0];
}

function valueToText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "name", "label", "value", "link", "url"]) {
      if (record[key] !== undefined) return valueToText(record[key]);
    }
  }
  return "";
}

function omitEmpty(value: LarkTicketCleaningProjection): LarkTicketCleaningProjection {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as LarkTicketCleaningProjection;
}
