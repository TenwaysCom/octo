import { readFileSync } from "node:fs";
import { prepareMessageContent } from "./prepared-message-content.js";
import { prepareTicketThread } from "./support-ticket-analysis.js";

const flatten = (value: unknown, type = "post") => prepareMessageContent(JSON.stringify(value), type);

describe("prepared rich text", () => {
  it("preserves legacy JSON evidence while unwrapping text envelopes only once", () => {
    for (const raw of ['{"error":"AccessError","code":403}', '{"text":"error","code":403}', '{}', '[{"error":"AccessError"}]']) {
      for (const type of ["text", undefined]) {
        expect(prepareMessageContent(raw, type)).toEqual({ text: raw, hasArtifact: false });
      }
      expect(flatten({ text: raw }, "text").text).toBe(raw);
    }
    const messages = prepareTicketThread([{ messageId: "error", messageType: "text", content: '{"error":"AccessError","email":"foo@example.com"}' }]);
    expect(messages[0].text).toBe('{"error":"AccessError","email":"[EMAIL]"}');
  });

  it("retains attachment evidence when resource metadata is absent or malformed", () => {
    for (const [type, label] of [["image", "图片"], ["file", "附件"], ["audio", "音频"], ["media", "视频"]]) {
      for (const raw of [undefined, "", "  ", "invalid-json", "null", "{}"]) {
        expect(prepareMessageContent(raw, type)).toEqual({ text: `[${label}]`, hasArtifact: true });
      }
    }
    expect(prepareTicketThread([{ messageId: "image", messageType: "image" }])[0])
      .toMatchObject({ messageId: "image", text: "[图片]", hasArtifact: true });
    expect(flatten({ file_name: "notes.pdf" }, "file")).toEqual({ text: "[附件：notes.pdf]", hasArtifact: true });
  });

  it("flattens the supplied transcript once, preserving every sentence and separate messages", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/prepared-rich-text.json", import.meta.url), "utf8"));
    const messages = prepareTicketThread(fixture.messages);
    const expected = readFileSync(new URL("./fixtures/prepared-rich-text.txt", import.meta.url), "utf8").trim();
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe(expected.trim());
    expect(messages[0]).toMatchObject({ senderLabel: "用户 1", hasArtifact: false });
    expect(messages[1]).toMatchObject({ senderLabel: "用户 2", replyTo: messages[0].messageId, text: "[未知提及] ticket record：when to add new-inbound stock to Odoo" });
    expect(JSON.stringify(messages)).not.toContain("senderId");
  });

  it("uses exactly one valid representation and preserves title and word spacing", () => {
    const content = [[{ tag: "text", text: "hello " }, { tag: "text", text: "world", style: ["bold"] }]];
    expect(flatten({ title: "Title", content, content_v2: [[{ tag: "text", text: "other" }]] }).text).toBe("Title\nhello world");
    for (const primary of [undefined, null, "bad", [], [[]], [[{ tag: "text", text: " " }]]]) {
      expect(flatten({ content: primary, content_v2: content }).text).toBe("hello world");
    }
    expect(flatten({ content: [[], [], [{ tag: "text", text: "A" }], [], [], [{ tag: "text", text: "B" }]] }).text).toBe("A\n\nB");
  });

  it("keeps mentions, links and artifact placeholders in sequence without resource keys", () => {
    expect(flatten({ content: [[
      { tag: "at", user_name: "Alice", user_id: "secret" }, { tag: "text", text: " " },
      { tag: "at", user_id: "@_user_1" }, { tag: "a", text: "Guide", href: "https://example.com" },
      { tag: "img", image_key: "secret" }, { tag: "file", file_name: "notes.pdf", file_key: "secret" },
      { tag: "media" }, { tag: "audio" }, { tag: "unknown" }, { tag: "text", text: "end" },
    ]] })).toEqual({ text: "@Alice [未知提及]Guide (https://example.com)[图片][附件：notes.pdf][视频][音频][不支持的内容]end", hasArtifact: true });
    expect(flatten({ file_name: "notes.pdf" }, "file")).toEqual({ text: "[附件：notes.pdf]", hasArtifact: true });
  });

  it("handles plain text, empty and malformed content without failing the thread", () => {
    expect(prepareMessageContent("literal {braces}", "text").text).toBe("literal {braces}");
    expect(flatten({ text: "hello" }, "text").text).toBe("hello");
    expect(flatten({ text: 2 }, "text").text).toBe("[消息内容解析失败]");
    expect(prepareMessageContent('{"text":', "text").text).toBe("[消息内容解析失败]");
    expect(prepareMessageContent("invalid", "post").text).toBe("[消息内容解析失败]");
    expect(flatten({ content: "bad" }).text).toBe("[消息内容解析失败]");
    expect(prepareMessageContent("", "text").text).toBe("[空消息]");
    expect(flatten({ content: [[]] }).text).toBe("[空消息]");
    expect(flatten({ elements: [] }, "interactive").text).toBe("[不支持的内容]");
    expect(prepareMessageContent("forwarded reference", "merge_forward").text).toBe("[不支持的内容]");
  });

  it("redacts extracted text and preserves sender identity, deletion and evidence rules", () => {
    const raw = [
      { messageId: "1", senderId: "a", senderType: "user", messageType: "post", content: JSON.stringify({ content: [[{ tag: "text", text: "foo@example.com order ABCD-1234" }]] }) },
      { messageId: "2", senderId: "a", senderType: "user", messageType: "text", content: "reply" },
      { messageId: "3", senderId: "b", senderType: "user", content: "hi" },
      { messageId: "4", senderType: "user", content: "unknown" },
      { messageId: "5", senderType: "bot", content: "bot" },
      { messageId: "6", senderType: "system", content: "system" },
      { messageId: "7", deleted: true, content: "deleted" },
    ];
    const before = JSON.stringify(raw);
    const prepared = prepareTicketThread([...raw, raw[0]]);
    expect(prepared.map(m => m.senderLabel)).toEqual(["用户 1", "用户 1", "用户 2", "用户", "客服机器人", "系统"]);
    expect(prepared[0].text).toBe("[EMAIL] [REFERENCE]");
    expect(prepareTicketThread(raw)).toEqual(prepared);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
