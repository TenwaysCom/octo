import type { LarkBaseTicketSyncItem } from "../adapters/postgres/platform-sync-store.js";
import type { LarkTicketThreadSnapshot } from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import type { ShadowContextInfo } from "./shadow-analysis.js";
import { redactSupportText } from "./support-ticket-analysis.js";
import { prepareTicketThreadAiContext } from "./ticket-thread-ai-context.js";

// Read only human-readable field forms; never serialize arbitrary field objects.
export function readShadowFieldText(value: unknown): string {
  if (typeof value === "string") return redactSupportText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readShadowFieldText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const field = value as Record<string, unknown>;
    return typeof field.text === "string" ? redactSupportText(field.text)
      : typeof field.name === "string" ? redactSupportText(field.name) : "";
  }
  return "";
}

export function buildShadowTicketContext(
  ticket: LarkBaseTicketSyncItem,
  snapshot: LarkTicketThreadSnapshot,
  source: ShadowContextInfo["source"],
  analyzedAt: string,
  maxMessageChars = 60_000,
) {
  const { text: threadText, info, evidenceIds } = prepareTicketThreadAiContext(snapshot, source, maxMessageChars);
  const fields = ticket.sourceFields ?? {};
  const description = readShadowFieldText(fields["Issue Description"])
    || readShadowFieldText(ticket.detailDescription) || readShadowFieldText(ticket.title);
  const text = [
    `analysis_time: ${analyzedAt} (UTC; do not assume the sender's local timezone)`,
    `ticket_number: ${readShadowFieldText(ticket.ticketNumber)}`,
    `title: ${readShadowFieldText(ticket.title)}`,
    `ticket_status: ${readShadowFieldText(ticket.ticketStatus)}`,
    `issue 类型: ${readShadowFieldText(ticket.issueType)}`,
    `business line: ${readShadowFieldText(fields["Business line"])}`,
    "Issue Description:", description,
    `snapshot_version: ${snapshot.snapshotVersion}`,
    `context_info: ${JSON.stringify(info)}`,
    "Lark thread context（脱敏快照；缺失或省略消息不代表没有回复；未提供时区不得推定相对时限）：",
    threadText,
  ].join("\n");
  return { text, info, evidenceIds };
}
