import { afterEach, describe, expect, it, vi } from "vitest";
import type { KimiChatRenderState } from "../types/acp-kimi.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kimi chat client", () => {
  it("aggregates ACP session updates into assistant content, thoughts, tool activity, summaries, and raw fallbacks", async () => {
    const { applyKimiChatEvent } = await import("./kimi-chat.js");

    let state: KimiChatRenderState = {
      sessionId: null,
      activeAssistantEntryId: null,
      transcript: [
        {
          id: "user-1",
          kind: "user",
          text: "请介绍一下会话状态",
        },
      ],
    };

    state = applyKimiChatEvent(state, {
      event: "session.created",
      data: {
        sessionId: "sess_1",
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "你",
          },
          messageId: "msg_assistant",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "好",
          },
          messageId: "msg_assistant",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "先看",
          },
          messageId: "msg_assistant",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "上下文",
          },
          messageId: "msg_assistant",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool_1",
          title: "Read file",
          status: "in_progress",
          locations: [
            {
              path: "/tmp/spec.md",
            },
          ],
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "tool_1",
          status: "completed",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "plan",
          entries: [
            {
              content: "Inspect updates",
              priority: "high",
              status: "in_progress",
            },
            {
              content: "Render transcript",
              priority: "medium",
              status: "pending",
            },
          ],
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "current_mode_update",
          currentModeId: "code",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "session_info_update",
          title: "Implement ACP rendering",
          updatedAt: "2026-04-14T09:30:00Z",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "config_option_update",
          configOption: {
            id: "show_thoughts",
            title: "Show thoughts",
          },
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "done",
      data: {
        sessionId: "sess_1",
        stopReason: "end_turn",
      },
    });

    expect(state.sessionId).toBe("sess_1");

    const assistantEntry = state.transcript.find((entry) => entry.kind === "assistant");
    expect(assistantEntry).toMatchObject({
      kind: "assistant",
      text: "你好",
      thoughts: [
        {
          text: "先看上下文",
        },
      ],
      toolCalls: [
        {
          id: "tool_1",
          title: "Read file",
          status: "completed",
          detail: "/tmp/spec.md",
        },
      ],
    });

    expect(
      state.transcript.filter((entry) => entry.kind === "status").map((entry) => entry.text),
    ).toEqual(
      expect.arrayContaining([
        "会话已创建 · sess_1",
        "计划已更新 · 2 项（1 进行中，1 待开始，0 已完成）",
        "模式已切换 · code",
        "会话信息已更新 · 标题：Implement ACP rendering · 时间：2026-04-14T09:30:00Z",
        "本轮已完成 · end_turn",
      ]),
    );

    const rawEntry = state.transcript.find((entry) => entry.kind === "raw");
    expect(rawEntry).toMatchObject({
      kind: "raw",
      label: "config_option_update",
    });
    expect(rawEntry?.raw).toContain("\"sessionUpdate\":\"config_option_update\"");
  });

  it("attaches late thoughts back to the assistant message with the same messageId", async () => {
    const { applyKimiChatEvent } = await import("./kimi-chat.js");

    let state: KimiChatRenderState = {
      sessionId: "sess_1",
      activeAssistantEntryId: null,
      transcript: [],
    };

    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "第一条回复",
          },
          messageId: "msg_1",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "第二条回复",
          },
          messageId: "msg_2",
        },
      },
    });
    state = applyKimiChatEvent(state, {
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "这是第一条的思路",
          },
          messageId: "msg_1",
        },
      },
    });

    const firstAssistant = state.transcript.find(
      (entry) => entry.kind === "assistant" && entry.messageId === "msg_1",
    );
    const secondAssistant = state.transcript.find(
      (entry) => entry.kind === "assistant" && entry.messageId === "msg_2",
    );
    const assistantEntries = state.transcript.filter(
      (entry) => entry.kind === "assistant",
    );

    expect(assistantEntries).toHaveLength(2);
    expect(firstAssistant?.thoughts?.map((thought) => thought.text)).toEqual([
      "这是第一条的思路",
    ]);
    expect(secondAssistant).toBeDefined();
    expect(secondAssistant?.thoughts ?? []).toEqual([]);
  });

  it("streams ACP events as frames arrive across chunk boundaries", async () => {
    const { createKimiChatClient } = await import("./kimi-chat.js");
    const seenEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    const response = createControllableSseResponse();

    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createKimiChatClient({
      baseUrl: "http://localhost:3000",
    });

    const sendPromise = client.sendMessage({
      operatorLarkId: "ou_123",
      message: "请介绍一下会话状态",
    }, {
      onEvent(event) {
        seenEvents.push({
          event: event.event,
          data: event.data,
        });
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/acp/kimi/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          operatorLarkId: "ou_123",
          message: "请介绍一下会话状态",
        }),
      }),
    );

    response.enqueue("event: session.created\ndata: {\"sessionId\":\"sess_1\"}\n\n");
    await vi.waitFor(() => {
      expect(seenEvents).toHaveLength(1);
    });

    expect(seenEvents).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_1",
        },
      },
    ]);

    response.enqueue(
      "event: acp.session.update\ndata: {\"sessionId\":\"sess_1\",\"update\":{\"sessionUpdate\":\"agent_message_chunk\",\"content\":{\"type\":\"text\",\"text\":\"你",
    );
    response.enqueue(
      "好\"}}}\n\nevent: done\ndata: {\"sessionId\":\"sess_1\",\"stopReason\":\"end_turn\"}\n\n",
    );
    response.close();

    await sendPromise;

    expect(seenEvents).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_1",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "你好",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_1",
          stopReason: "end_turn",
        },
      },
    ]);
  });

  it("includes sessionId in follow-up requests", async () => {
    const { createKimiChatClient } = await import("./kimi-chat.js");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({
        start(controller) {
          controller.close();
        },
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createKimiChatClient({
      baseUrl: "http://localhost:3000",
    });

    await client.sendMessage({
      operatorLarkId: "ou_123",
      sessionId: "sess_1",
      message: "follow up",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3000/api/acp/kimi/chat",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toEqual({
      operatorLarkId: "ou_123",
      sessionId: "sess_1",
      message: "follow up",
    });
  });

  it("surfaces backend error messages for follow-up failures", async () => {
    const { createKimiChatClient } = await import("./kimi-chat.js");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            errorCode: "SESSION_FORBIDDEN",
            errorMessage: "session does not belong to this operator",
          },
        }),
        {
          status: 403,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createKimiChatClient({
      baseUrl: "http://localhost:3000",
    });

    await expect(
      client.sendMessage({
        operatorLarkId: "ou_123",
        sessionId: "sess_1",
        message: "follow up",
      }),
    ).rejects.toMatchObject({
      message: "session does not belong to this operator",
      code: "SESSION_FORBIDDEN",
    });
  });
});

function createControllableSseResponse() {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controllerRef = controller;
      },
    }),
    {
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    },
  ) as Response & {
    enqueue(chunk: string): void;
    close(): void;
  };

  response.enqueue = (chunk: string) => {
    controllerRef?.enqueue(encoder.encode(chunk));
  };
  response.close = () => {
    controllerRef?.close();
  };

  return response;
}
