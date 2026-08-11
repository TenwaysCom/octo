const TICKET_NUMBER_FIELDS = ["Ticket 编号", "Ticket编号", "ticket编号", "Ticket Number", "Ticket No.", "编号"];
const ISSUE_TYPE_FIELDS = ["Issue 类型", "Issue Type", "issue_type"];
const RESPONSIBLE_FIELDS = ["Responsible", "负责人", "责任人", "Owner", "Assignee"];
const URGENCY_FIELDS = ["紧急度"];
const CREATED_AT_FIELDS = ["创建时间", "Created Time", "Created At"];
const DETAIL_DESCRIPTION_FIELDS = ["Details Description", "Issue Description"];
const MEEGLE_LINK_FIELDS = ["meegle链接", "Meegle Link", "meegleLink"];
const LARK_MESSAGE_LINK_FIELDS = ["Lark Message Link", "Message Link", "Thread Link", "Chat Link", "lark_message_link"];
const LARK_MESSAGE_LINK_PATTERN = /https?:\/\/[^\s"'<>)\]]*(?:threadid|chatid|messageid)=[^\s"'<>)\]]*/i;

export interface LarkTicketCleaningProjection {
  ticketNumber?: string;
  issueType?: string;
  responsible?: string;
  priority?: string;
  createdAt?: string;
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
    responsible: readField(source, RESPONSIBLE_FIELDS),
    priority: readField(source, URGENCY_FIELDS),
    createdAt: createdTime ?? readField(source, CREATED_AT_FIELDS),
    detailDescription,
    meegleLink: readUrl(source, MEEGLE_LINK_FIELDS),
    larkMessageLink: readUrl(source, LARK_MESSAGE_LINK_FIELDS) ?? findMessageLink(detailDescription),
  });
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
