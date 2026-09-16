import { getLarkTicketBadgeTone } from "../../lib/lark-ticket-badges.js";

export function LarkTicketBadge({ kind, value }) {
  const label = value || "未设置";
  return <span className={`lark-ticket-badge lark-ticket-badge--${kind} lark-ticket-badge--${getLarkTicketBadgeTone(kind, value)}`}>{label}</span>;
}
