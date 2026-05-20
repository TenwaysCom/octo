import { describe, expect, it, vi } from "vitest";
import {
  parseLarkMessageLink,
  extractTextFromLarkMessageContent,
  fetchLarkChatHistory,
  buildSummaryPrompt,
  generateBugMarkdown,
  generateStoryMarkdown,
} from "./meegle-summary.service.js";

describe("parseLarkMessageLink", () => {
  it("parses threadid and chatid from applink URL", () => {
    const link = "https://applink.larksuite.com/client/thread/open?threadid=7587385675461168866&chatid=7538726794547986470&thread_position=1ticket";
    const result = parseLarkMessageLink(link);
    expect(result).toEqual({
      threadId: "7587385675461168866",
      chatId: "7538726794547986470",
      messageId: undefined,
    });
  });

  it("parses messageid from URL", () => {
    const link = "https://applink.larksuite.com/client/message/open?messageid=om_abc123";
    const result = parseLarkMessageLink(link);
    expect(result).toEqual({
      threadId: undefined,
      chatId: undefined,
      messageId: "om_abc123",
    });
  });

  it("returns null for invalid URL", () => {
    expect(parseLarkMessageLink("not-a-url")).toBeNull();
  });

  it("returns null when no relevant params", () => {
    expect(parseLarkMessageLink("https://example.com?foo=bar")).toBeNull();
  });
});

describe("extractTextFromLarkMessageContent", () => {
  it("extracts text from simple text message", () => {
    const content = JSON.stringify({ text: "Hello world" });
    expect(extractTextFromLarkMessageContent(content)).toBe("Hello world");
  });

  it("extracts text from post message", () => {
    const content = JSON.stringify({
      title: "",
      content: [
        [{ tag: "text", text: "First paragraph" }],
        [{ tag: "text", text: "Second paragraph" }],
      ],
    });
    expect(extractTextFromLarkMessageContent(content)).toBe("First paragraph Second paragraph");
  });

  it("extracts text from post message with images and at tags", () => {
    const content = JSON.stringify({
      title: "",
      content: [
        [{ tag: "img", image_key: "img_123" }],
        [
          { tag: "text", text: "一月会修改逻辑", style: [] },
          { tag: "at", user_id: "@_user_1", user_name: "August Zhong", style: [] },
          { tag: "text", text: " ", style: [] },
          { tag: "at", user_id: "@_user_2", user_name: "Queenie Qiu", style: [] },
        ],
      ],
    });
    expect(extractTextFromLarkMessageContent(content)).toBe("一月会修改逻辑  ");
  });

  it("returns empty for undefined content", () => {
    expect(extractTextFromLarkMessageContent(undefined)).toBe("");
  });

  it("returns raw string for invalid JSON", () => {
    expect(extractTextFromLarkMessageContent("not-json")).toBe("not-json");
  });
});

describe("fetchLarkChatHistory", () => {
  it("fetches thread messages and formats them", async () => {
    const mockLarkClient = {
      getThreadMessages: vi.fn().mockResolvedValue({
        items: [
          { message_id: "m1", root_id: undefined, content: '{"text":"Message one"}' },
          { message_id: "m2", root_id: "m1", content: '{"text":"Message two"}' },
        ],
        hasMore: false,
      }),
    } as unknown as Parameters<typeof fetchLarkChatHistory>[0];

    const result = await fetchLarkChatHistory(
      mockLarkClient,
      "https://applink.larksuite.com/client/thread/open?threadid=123&chatid=456",
    );

    expect(mockLarkClient.getThreadMessages).toHaveBeenCalledWith("123");
    expect(result).toBe("- Message one\n- Message two");
  });

  it("fetches single message when messageId is provided", async () => {
    const mockLarkClient = {
      getMessage: vi.fn().mockResolvedValue({
        message_id: "om_abc",
        content: '{"text":"Single message"}',
      }),
    } as unknown as Parameters<typeof fetchLarkChatHistory>[0];

    const result = await fetchLarkChatHistory(
      mockLarkClient,
      "https://applink.larksuite.com/client/message/open?messageid=om_abc",
    );

    expect(mockLarkClient.getMessage).toHaveBeenCalledWith("om_abc");
    expect(result).toBe("- Single message");
  });

  it("truncates long messages and total length", async () => {
    const longText = "a".repeat(500);
    const mockLarkClient = {
      getThreadMessages: vi.fn().mockResolvedValue({
        items: Array.from({ length: 30 }, (_, i) => ({
          message_id: `m${i}`,
          root_id: "root",
          content: JSON.stringify({ text: `msg${i} ${longText}` }),
        })),
        hasMore: false,
      }),
    } as unknown as Parameters<typeof fetchLarkChatHistory>[0];

    const result = await fetchLarkChatHistory(mockLarkClient, "https://applink.larksuite.com/client/thread/open?threadid=123");

    // Should only include recent messages and truncate each to 300 chars
    expect(result.length).toBeLessThanOrEqual(2500);
    expect(result).toContain("[...更多聊天记录已截断]");
  });

  it("returns empty string when Lark API fails", async () => {
    const mockLarkClient = {
      getThreadMessages: vi.fn().mockRejectedValue(new Error("API error")),
    } as unknown as Parameters<typeof fetchLarkChatHistory>[0];

    const result = await fetchLarkChatHistory(mockLarkClient, "https://applink.larksuite.com/client/thread/open?threadid=123");
    expect(result).toBe("");
  });

  it("returns empty string for invalid link", async () => {
    const mockLarkClient = {} as unknown as Parameters<typeof fetchLarkChatHistory>[0];
    const result = await fetchLarkChatHistory(mockLarkClient, "not-a-link");
    expect(result).toBe("");
  });
});

describe("buildSummaryPrompt", () => {
  const workitem = {
    name: "Test Bug",
    assignee: "Alice",
    fields: { description: "Something broke", status: "open" },
  };

  it("includes chat history when provided", () => {
    const prompt = buildSummaryPrompt(workitem, null, true, Date.now(), "- Message one\n- Message two");
    expect(prompt).toContain("相关 Lark 聊天记录摘要（来自消息 thread）");
    expect(prompt).toContain("- Message one");
    expect(prompt).toContain("- Message two");
  });

  it("omits chat history section when empty", () => {
    const prompt = buildSummaryPrompt(workitem, null, true, Date.now(), "");
    expect(prompt).not.toContain("相关 Lark 聊天记录摘要");
  });

  it("uses completion time in SLA when workitem is finished", () => {
    const finishedWorkitem = {
      name: "Test Bug",
      assignee: "Alice",
      fields: {
        description: "Something broke",
        state_times: [
          { state_key: "state_0", start_time: 0, end_time: 86400000, name: "Start" },
          { state_key: "state_1", start_time: 86400000, end_time: 172800000, name: "Finished" },
        ],
      },
    };
    const prompt = buildSummaryPrompt(finishedWorkitem, null, true, 0, "");
    expect(prompt).toContain("实际完成时间");
    expect(prompt).toContain("实际耗时");
    expect(prompt).toContain("✅ 已完成");
    expect(prompt).not.toContain("当前已耗时");
  });

  it("uses current time in SLA when workitem is not finished", () => {
    const prompt = buildSummaryPrompt(workitem, null, true, 0, "");
    expect(prompt).toContain("当前已耗时");
    expect(prompt).not.toContain("实际完成时间");
  });
});

describe("generateBugMarkdown", () => {
  const workitem = {
    name: "Bug name",
    assignee: "Bob",
    fields: { description: "Bug desc", status: "open" },
  };

  it("includes chat history block when provided", () => {
    const md = generateBugMarkdown(workitem, null, Date.now(), "- msg1\n- msg2");
    expect(md).toContain("## 💬 Lark 聊天记录摘要");
    expect(md).toContain("- msg1");
    expect(md).toContain("- msg2");
  });

  it("omits chat history block when empty", () => {
    const md = generateBugMarkdown(workitem, null, Date.now(), "");
    expect(md).not.toContain("## 💬 Lark 聊天记录摘要");
  });

  it("shows completed SLA when workitem is finished", () => {
    const finishedWorkitem = {
      name: "Bug name",
      assignee: "Bob",
      fields: {
        description: "Bug desc",
        state_times: [
          { state_key: "state_0", start_time: 0, end_time: 86400000, name: "Start" },
          { state_key: "state_1", start_time: 86400000, end_time: 172800000, name: "Finished" },
        ],
      },
    };
    const md = generateBugMarkdown(finishedWorkitem, null, 0, "");
    expect(md).toContain("实际完成时间");
    expect(md).toContain("实际耗时");
    expect(md).toContain("✅ 已完成");
    expect(md).not.toContain("当前已耗时");
    expect(md).not.toContain("❌ 超期");
  });

  it("shows elapsed SLA when workitem is not finished", () => {
    const openWorkitem = {
      name: "Bug name",
      assignee: "Bob",
      fields: { description: "Bug desc" },
    };
    const md = generateBugMarkdown(openWorkitem, null, 0, "");
    expect(md).toContain("当前已耗时");
    expect(md).not.toContain("实际完成时间");
  });
});

describe("generateStoryMarkdown", () => {
  const workitem = {
    name: "Story name",
    assignee: "Carol",
    fields: { description: "Story desc", status: "open" },
  };

  it("includes chat history block when provided", () => {
    const md = generateStoryMarkdown(workitem, null, Date.now(), "- msg1\n- msg2");
    expect(md).toContain("## 💬 Lark 聊天记录摘要");
    expect(md).toContain("- msg1");
    expect(md).toContain("- msg2");
  });

  it("omits chat history block when empty", () => {
    const md = generateStoryMarkdown(workitem, null, Date.now(), "");
    expect(md).not.toContain("## 💬 Lark 聊天记录摘要");
  });
});
