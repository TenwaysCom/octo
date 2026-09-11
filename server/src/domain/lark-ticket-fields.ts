// Canonical Lark Base ticket fields by semantic key. The ticket sync projection
// (lark-ticket-cleaning.ts), the platform-sync service and the field-update
// workflow all resolve the same physical Base fields through these candidates.
export type LarkTicketSemanticField =
  | "status"
  | "issueType"
  | "requester"
  | "responsible"
  | "priority"
  | "businessLine";

export const LARK_TICKET_FIELD_CANDIDATES: Record<LarkTicketSemanticField, string[]> = {
  status: ["Status", "状态", "Ticket Status", "ticket_status"],
  issueType: ["Issue 类型", "Issue Type", "issue_type"],
  requester: ["需求人", "Requester", "Requestor"],
  responsible: ["Responsible", "负责人", "责任人", "Owner", "Assignee"],
  priority: ["紧急度"],
  businessLine: ["Business line"],
};

export const LARK_TICKET_SEMANTIC_FIELDS = Object.keys(
  LARK_TICKET_FIELD_CANDIDATES,
) as LarkTicketSemanticField[];

// Title candidates shared by the sync upsert and the field-update projection.
export const LARK_TICKET_TITLE_FIELD_CANDIDATES = [
  "Title", "标题", "名称", "name", "Issue Description", "问题描述", "问题",
];

export function isLarkTicketSemanticField(value: string): value is LarkTicketSemanticField {
  return Object.prototype.hasOwnProperty.call(LARK_TICKET_FIELD_CANDIDATES, value);
}
