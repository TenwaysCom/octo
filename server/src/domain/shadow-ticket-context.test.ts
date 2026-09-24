import { buildShadowTicketContext } from "./shadow-ticket-context.js";
import type { LarkBaseTicketSyncItem } from "../adapters/postgres/platform-sync-store.js";
import type { LarkTicketThreadSnapshot } from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import type { PreparedTicketMessage } from "./support-ticket-analysis.js";

const ticket: LarkBaseTicketSyncItem = { baseId: "base", tableId: "table", recordId: "record", title: "Report error", syncedAt: "2026-09-23T00:00:00Z" };
const now = "2026-09-23T10:00:00Z";
function snapshot(texts: string[]): LarkTicketThreadSnapshot {
  return {
    ...ticket, messageLink: "", threadId: "thread", messages: [], snapshotVersion: 1,
    historyComplete: true, dirty: false, createdAt: now, updatedAt: now,
    lastSuccessfulSyncAt: "2026-09-23T09:00:00Z", lastCheckedAt: "2026-09-23T09:30:00Z",
    preparedMessages: texts.map((text, index): PreparedTicketMessage => ({
      messageId: `om_long_${index + 1}`, text, senderRole: "user", senderLabel: `用户 ${index + 1}`, createdAt: now, hasArtifact: false,
    })),
  };
}

describe("Shadow model context", () => {
  it("keeps full IDs on the snapshot and uses short bidirectional and external reply references only in the model copy", () => {
    const input = snapshot(["初始问题", "收到", "谢谢", "外部回复"]);
    input.preparedMessages[0].replyTo = "om_long_2";
    input.preparedMessages[1].replyTo = "om_long_1";
    input.preparedMessages[2].replyTo = "outside";
    input.preparedMessages[3].replyTo = "outside";
    const before = structuredClone(input);
    const result = buildShadowTicketContext(ticket, input, "lark", now);
    expect(result.text).not.toContain("om_long_");
    expect(result.text).toContain("Reply to: M2");
    expect(result.text).toContain("Reply to: M1");
    expect(result.text.match(/Reply to: E1 \(outside snapshot\)/g)).toHaveLength(2);
    expect(result.text).toContain("收到");
    expect(result.text).toContain("谢谢");
    expect(result.evidenceIds.get("M1")).toBe("om_long_1");
    expect(input).toEqual(before);
  });

  it("preserves long-message causes and final negation while compacting stack frames", () => {
    const frames = Array.from({ length: 8 }, (_, i) => `    at f${i} (https://private.example/assets/code.js:${i}:1)`).join("\n");
    const input = snapshot([`${"故障背景".repeat(500)}\n${frames}\nCaused by: permission denied\n${frames}\n仍未恢复，不能关闭`]);
    const result = buildShadowTicketContext(ticket, input, "lark", now);
    expect(result.text).toContain("Caused by: permission denied");
    expect(result.text).toContain("仍未恢复，不能关闭");
    expect(result.text).not.toContain("private.example");
    expect(result.text.match(/省略 5 条/g)).toHaveLength(2);
    expect(result.info.compactedMessages).toBe(1);
    expect(result.info.truncated).toBe(false);
  });

  it("omits whole oversized messages and preserves initial and final state with explicit missing ranges", () => {
    const input = snapshot(["初始诉求", "中间超长".repeat(300), "已恢复", "重新报障，仍然失败"]);
    input.preparedMessages[3].replyTo = "om_long_3";
    const result = buildShadowTicketContext(ticket, input, "lark", now, 400);
    expect(result.text).toContain("初始诉求");
    expect(result.text).toContain("已恢复");
    expect(result.text).toContain("重新报障，仍然失败");
    expect(result.text).not.toContain("中间超长");
    expect(result.info).toMatchObject({ truncated: true, omittedRanges: ["M2"], includedMessages: 3 });
    expect(result.evidenceIds.has("M2")).toBe(false);
  });

  it("prioritizes the latest correction when the initial message would consume its budget", () => {
    const result = buildShadowTicketContext(ticket, snapshot(["起因".repeat(150), "尚未解决"]), "cache", now, 400);
    expect(result.text).toContain("尚未解决");
    expect(result.info.omittedRanges).toEqual(["M1"]);
  });

  it("normalizes and redacts human-readable fields without serializing sensitive objects", () => {
    const result = buildShadowTicketContext({ ...ticket, sourceFields: {
      "Issue Description": [{ text: "联系 a@example.com" }, { secret: "never-serialize" }],
      "Business line": [{ name: "B2B" }],
    } }, snapshot(["需要处理"]), "lark", now);
    expect(result.text.match(/联系 \[EMAIL\]/g)).toHaveLength(1);
    expect(result.text).toContain("business line: B2B");
    expect(result.text).not.toContain("a@example.com");
    expect(result.text).not.toContain("never-serialize");
  });

  it("falls back to detailDescription, reports stale/incomplete/dirty snapshots, and exposes unknown sync times", () => {
    const input = snapshot(["需核实"]);
    input.historyComplete = false;
    input.dirty = true;
    input.lastSuccessfulSyncAt = undefined;
    const result = buildShadowTicketContext({ ...ticket, detailDescription: "fallback a@example.com", sourceFields: { "Issue Description": { attachment: "secret" } } }, input, "stale_cache", now);
    expect(result.text).toContain("fallback [EMAIL]");
    expect(result.text).toContain(now);
    expect(result.info).toMatchObject({ source: "stale_cache", historyComplete: false, dirty: true, syncedAt: null });
  });

  it("retains the reply ancestor chain and handles cycles without changing snapshot order", () => {
    const input = snapshot(["诉求", "承诺今天回复", "收到", "已经逾期，请反馈"]);
    input.preparedMessages[3].replyTo = "om_long_2";
    input.preparedMessages[1].replyTo = "om_long_3";
    input.preparedMessages[2].replyTo = "om_long_2";
    const result = buildShadowTicketContext(ticket, input, "lark", now);
    expect([...result.evidenceIds.keys()]).toEqual(["M1", "M2", "M3", "M4"]);
    expect(result.text).toContain("Reply to: M2");
  });
});
