import { z } from "zod";
import type { LarkTicketThreadSnapshot } from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import { redactSupportText } from "./support-ticket-analysis.js";
import { compactThreadMessageText } from "./wiki-answer-context.js";
import type { PreparedTicketMessage } from "./support-ticket-analysis.js";

// Aliases are scoped to the immutable snapshot, never to the selected subset.
export function renderTicketThreadMessages(messages: PreparedTicketMessage[], compactIds = true) {
  const aliases = new Map(messages.map((message, index) => [message.messageId, `M${index + 1}`]));
  const externalAliases = new Map<string, string>();
  function replyLabel(id: string): string {
    if (!compactIds) return id;
    if (aliases.has(id)) return aliases.get(id)!;
    if (!externalAliases.has(id)) externalAliases.set(id, `E${externalAliases.size + 1}`);
    return `${externalAliases.get(id)} (outside snapshot)`;
  }
  return messages.map((message, index) => ({
    alias: `M${index + 1}`,
    messageId: message.messageId,
    replyTo: message.replyTo ? aliases.get(message.replyTo) : undefined,
    text: [
      compactIds ? `M${index + 1}` : `Message ${index + 1} (${message.messageId})`,
      message.createdAt && `Time: ${message.createdAt}`,
      `Sender role: ${message.senderRole}`,
      message.senderLabel && `Sender: ${message.senderLabel}`,
      message.replyTo && `Reply to: ${replyLabel(message.replyTo)}`,
      message.text,
    ].filter(Boolean).join("\n"),
  }));
}

export const ticketThreadContextInfoSchema = z.object({
  source: z.enum(["cache", "lark", "stale_cache", "none"]),
  historyComplete: z.boolean(),
  dirty: z.boolean(),
  syncedAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
  totalMessages: z.number().int().nonnegative(),
  includedMessages: z.number().int().nonnegative(),
  truncated: z.boolean(),
  omittedRanges: z.array(z.string().regex(/^M\d+(?:–M\d+)?$/)),
  compactedMessages: z.number().int().nonnegative(),
});

export type TicketThreadContextInfo = z.infer<typeof ticketThreadContextInfoSchema>;

// Formal Summary and Shadow must share selection, compaction and evidence scope.
export function prepareTicketThreadAiContext(
  snapshot: LarkTicketThreadSnapshot,
  source: TicketThreadContextInfo["source"],
  maxMessageChars = 60_000,
) {
  let compactedMessages = 0;
  const messages = snapshot.preparedMessages.map((message) => {
    const redacted = redactSupportText(message.text);
    const text = compactThreadMessageText(redacted);
    if (text !== redacted) compactedMessages++;
    return { ...message, senderLabel: redactSupportText(message.senderLabel), text };
  });
  const blocks = renderTicketThreadMessages(messages);
  const byAlias = new Map(blocks.map((block, index) => [block.alias, index]));
  const selected = new Set<number>();
  let usedChars = 0;
  const take = (index: number) => {
    if (index < 0 || index >= blocks.length || selected.has(index)) return;
    const cost = blocks[index].text.length + (selected.size ? 2 : 0);
    if (usedChars + cost > maxMessageChars) return;
    selected.add(index);
    usedChars += cost;
  };
  // Keep whole messages; an oversized block is omitted, never silently clipped.
  take(blocks.length - 1);
  take(0);
  for (let index = blocks.length - 1; index >= 0; index--) {
    take(index);
    if (!selected.has(index)) continue;
    const visited = new Set<number>([index]);
    let parent = blocks[index].replyTo;
    while (parent && byAlias.has(parent)) {
      const parentIndex = byAlias.get(parent)!;
      if (visited.has(parentIndex)) break;
      visited.add(parentIndex);
      take(parentIndex);
      parent = blocks[parentIndex].replyTo;
    }
  }
  const omittedRanges: string[] = [];
  for (let index = 0; index < blocks.length; index++) {
    if (selected.has(index)) continue;
    const first = index;
    while (index + 1 < blocks.length && !selected.has(index + 1)) index++;
    omittedRanges.push(first === index ? `M${first + 1}` : `M${first + 1}–M${index + 1}`);
  }
  const included = blocks.filter((_, index) => selected.has(index));
  const evidenceIds = new Map(included.map((block) => [block.alias, block.messageId]));
  const info: TicketThreadContextInfo = {
    source,
    historyComplete: snapshot.historyComplete === true,
    dirty: snapshot.dirty === true,
    syncedAt: snapshot.lastSuccessfulSyncAt ?? null,
    checkedAt: snapshot.lastCheckedAt ?? null,
    totalMessages: blocks.length,
    includedMessages: included.length,
    truncated: selected.size !== blocks.length,
    omittedRanges,
    compactedMessages,
  };
  return {
    text: included.map((block) => block.text).join("\n\n") || "(no messages fit the context budget)",
    info,
    evidenceIds,
  };
}

export function resolveTicketThreadEvidence(ids: string[], evidenceIds: Map<string, string>): string[] | undefined {
  if (ids.some((id) => !evidenceIds.has(id))) return undefined;
  return [...new Set(ids)].map((id) => evidenceIds.get(id)!);
}

// Applied after database templates too: legacy examples must not cause the model
// to invent full IDs or cite omitted messages. This changes only the wire references.
export const TICKET_SUMMARY_THREAD_REFERENCE_INSTRUCTION = `# Server 消息引用与上下文契约
本次 thread 消息已使用 M1/M2 短引用，原始长 ID 未提供。上文模板或 JSON 示例中的 Message ID 在本次均指实际呈现的 M 标签，evidenceMessageIds 示例应理解为 ["M1"]，不得输出 om_xxx 等旧示例或自行补造原始 ID。
只能引用实际呈现的消息，context_info.omittedRanges 中的标签和 E（outside snapshot）引用都不是可用证据。意图证据至少一条且不得重复，服务端会回映射原 ID。
结合 context_info 中的完整性、同步时间与省略范围说明证据局限；未看到回复不代表无人回复。保留最新纠正、失败或重开的事实，不以旧的已解决结论覆盖它们。“收到/谢谢”不单独证明恢复。
保持原有 support-analysis-result-v1 JSON 结构及意图/结果/质量/总结内容，不增加 Shadow 专用字段。`;
