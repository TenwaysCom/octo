import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kimi chat client", () => {
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
      "event: acp.session.update\ndata: {\"sessionId\":\"sess_1\",\"update\":{\"content\":\"你",
    );
    response.enqueue(
      "好\"}}\n\nevent: done\ndata: {\"sessionId\":\"sess_1\",\"stopReason\":\"end_turn\"}\n\n",
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
            content: "你好",
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
