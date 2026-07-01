import {
  createAcpKimiProxyService,
  type AcpKimiProxyServiceDeps,
} from "./acp-kimi-proxy.service.js";

function createProxyDeps(): Required<
  Pick<AcpKimiProxyServiceDeps, "sessionRegistry" | "ownershipStore">
> {
  return {
    sessionRegistry: {
      get: vi.fn(),
      set: vi.fn(),
      touch: vi.fn(),
      delete: vi.fn(),
    },
    ownershipStore: {
      getBySessionId: vi.fn(),
      listByOperatorLarkId: vi.fn(),
      claim: vi.fn(),
      rename: vi.fn(),
      deleteForOperator: vi.fn(),
    },
  };
}

describe("acp kimi proxy service", () => {
  it("runs one-shot chats without registering a reusable session and closes the runtime", async () => {
    const runtime = {
      sessionId: "sess_oneshot",
      prompt: vi.fn(async ({ emit }) => {
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_oneshot",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "done",
              },
            },
          },
        });
        return {
          stopReason: "end_turn",
        };
      }),
      close: vi.fn(),
    };
    const deps = createProxyDeps();
    const service = createAcpKimiProxyService({
      ...deps,
      createSessionRuntime: vi.fn().mockResolvedValue(runtime),
    });
    const events: unknown[] = [];

    await service.chatOneShot(
      {
        operatorLarkId: "ou_1",
        message: "summarize this story",
      },
      (event) => {
        events.push(event);
      },
    );

    expect(runtime.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "summarize this story",
      }),
    );
    expect(runtime.close).toHaveBeenCalledTimes(1);
    expect(deps.sessionRegistry.set).not.toHaveBeenCalled();
    expect(deps.ownershipStore.claim).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_oneshot",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_oneshot",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "done",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_oneshot",
          stopReason: "end_turn",
        },
      },
    ]);
  });
});
