import { prepareTicketThread, redactSupportText, validateSupportEvidence } from "./support-ticket-analysis.js";

describe("support ticket analysis preparation", () => {
  it("sorts, deduplicates, preserves replies, and redacts direct identifiers", () => {
    const messages = prepareTicketThread([
      { messageId: "m2", parentId: "m1", createdAt: "2026-09-01T10:01:00.000Z", senderId: "user_2", senderType: "user", content: "订单: AB-1234, foo@example.com", messageType: "text" },
      { messageId: "m1", createdAt: "2026-09-01T10:00:00.000Z", senderId: "user_1", senderType: "user", content: "请帮忙", messageType: "text" },
      { messageId: "m1", createdAt: "2026-09-01T10:00:00.000Z", senderType: "user", content: "duplicate", messageType: "text" },
    ]);
    expect(messages).toEqual([
      expect.objectContaining({ messageId: "m1", senderLabel: "用户 1", text: "请帮忙" }),
      expect.objectContaining({ messageId: "m2", senderLabel: "用户 2", replyTo: "m1", text: "[REFERENCE], [EMAIL]" }),
    ]);
    expect(validateSupportEvidence(["m1", "m2"], messages)).toBe(true);
    expect(validateSupportEvidence(["unknown"], messages)).toBe(false);
  });

  it("does not retain raw email addresses", () => {
    expect(redactSupportText("contact Foo.Bar@example.com")).toBe("contact [EMAIL]");
  });
});
