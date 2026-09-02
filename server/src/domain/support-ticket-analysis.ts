import type { LarkTicketThreadMessage } from "../adapters/postgres/lark-ticket-thread-sync-store.js";

export const SUPPORT_INTENT_TYPES = [
  "access_request", "troubleshoot", "how_to", "bug_report", "service_request",
  "follow_up", "confirmation", "escalation", "chatter", "other",
] as const;

export type SupportIntentType = typeof SUPPORT_INTENT_TYPES[number];

export const SUPPORT_REDACTION_VERSION = "v2";

export interface PreparedTicketMessage {
  messageId: string;
  replyTo?: string;
  createdAt?: string;
  senderRole: "user" | "bot" | "system" | "unknown";
  senderLabel?: string;
  text: string;
  hasArtifact: boolean;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ORDER_PATTERN = /(?:\border\b|订单|工单)[\s#:：-]*[A-Z0-9-]{4,}\b/gi;

export function redactSupportText(value: string | undefined): string {
  return (value || "")
    .replace(EMAIL_PATTERN, "[EMAIL]")
    .replace(ORDER_PATTERN, "[REFERENCE]")
    .trim();
}

export function prepareTicketThread(messages: LarkTicketThreadMessage[]): PreparedTicketMessage[] {
  const seen = new Set<string>();
  const userLabels = new Map<string, number>();
  return [...messages]
    .sort((left, right) => `${left.createdAt || ""}:${left.messageId}`.localeCompare(`${right.createdAt || ""}:${right.messageId}`))
    .flatMap((message) => {
      if (seen.has(message.messageId) || message.deleted) return [];
      seen.add(message.messageId);
      const text = redactSupportText(message.content);
      const senderRole = message.senderType === "user" ? "user" : message.senderType === "bot" ? "bot" : message.senderType === "system" ? "system" : "unknown";
      const userNumber = senderRole === "user" && message.senderId
        ? userLabels.get(message.senderId) ?? (userLabels.set(message.senderId, userLabels.size + 1), userLabels.size)
        : undefined;
      return [{
        messageId: message.messageId,
        ...(message.parentId ? { replyTo: message.parentId } : {}),
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
        senderRole,
        senderLabel: senderRole === "user" ? userNumber ? `用户 ${userNumber}` : "用户" : senderRole === "bot" ? "客服机器人" : senderRole === "system" ? "系统" : "未知发送者",
        text: text || `[${message.messageType || "unsupported"} message]`,
        hasArtifact: !["text", "post"].includes(message.messageType || ""),
      }];
    });
}

export function validateSupportEvidence(messageIds: string[], messages: PreparedTicketMessage[]): boolean {
  const known = new Set(messages.map((message) => message.messageId));
  return messageIds.length > 0 && messageIds.every((messageId) => known.has(messageId));
}
