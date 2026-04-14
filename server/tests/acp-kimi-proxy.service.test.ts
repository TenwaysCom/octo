import { describe, expect, it, vi } from "vitest";

describe("acp kimi proxy service", () => {
  it("reuses the same backend runtime for a follow-up turn by session id", async () => {
    const { createAcpKimiProxyService } = await import(
      "../src/application/services/acp-kimi-proxy.service.js"
    );
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const registry = createInMemoryKimiSessionRegistry();
    const prompt = vi
      .fn()
      .mockImplementationOnce(async ({ message, emit }) => {
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_1",
            update: {
              content: `reply:${message}`,
            },
          },
        });

        return { stopReason: "end_turn" };
      })
      .mockImplementationOnce(async ({ message, emit }) => {
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_1",
            update: {
              content: `reply:${message}`,
            },
          },
        });

        return { stopReason: "end_turn" };
      });
    const runtime = {
      sessionId: "sess_1",
      prompt,
      close: vi.fn(),
    };
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
    });

    const firstEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    await service.chat(
      {
        operatorLarkId: "ou_123",
        message: "first turn",
      },
      (event) => {
        firstEvents.push(event);
      },
    );

    const secondEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    await service.chat(
      {
        operatorLarkId: "ou_123",
        sessionId: "sess_1",
        message: "follow up",
      },
      (event) => {
        secondEvents.push(event);
      },
    );

    expect(createSessionRuntime).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: "first turn",
      }),
    );
    expect(prompt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: "follow up",
      }),
    );
    expect(firstEvents).toEqual([
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
            content: "reply:first turn",
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
    expect(secondEvents).toEqual([
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            content: "reply:follow up",
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

  it("rejects follow-up turns from a different operator", async () => {
    const { createAcpKimiProxyService } = await import(
      "../src/application/services/acp-kimi-proxy.service.js"
    );
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const registry = createInMemoryKimiSessionRegistry();
    const runtime = {
      sessionId: "sess_1",
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      close: vi.fn(),
    };
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
    });

    await service.chat(
      {
        operatorLarkId: "ou_owner",
        message: "first turn",
      },
      () => undefined,
    );

    await expect(
      service.chat(
        {
          operatorLarkId: "ou_intruder",
          sessionId: "sess_1",
          message: "follow up",
        },
        () => undefined,
      ),
    ).rejects.toMatchObject({
      code: "SESSION_FORBIDDEN",
    });

    expect(runtime.prompt).toHaveBeenCalledTimes(1);
  });

  it("rejects overlapping follow-up turns for the same session", async () => {
    const { createAcpKimiProxyService } = await import(
      "../src/application/services/acp-kimi-proxy.service.js"
    );
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const registry = createInMemoryKimiSessionRegistry();
    const deferred = createDeferred<void>();
    const runtime = {
      sessionId: "sess_1",
      prompt: vi.fn(async () => {
        await deferred.promise;
        return { stopReason: "end_turn" };
      }),
      close: vi.fn(),
    };
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
    });

    const firstTurn = service.chat(
      {
        operatorLarkId: "ou_123",
        message: "first turn",
      },
      () => undefined,
    );

    await vi.waitFor(() => {
      expect(runtime.prompt).toHaveBeenCalledTimes(1);
    });

    await expect(
      service.chat(
        {
          operatorLarkId: "ou_123",
          sessionId: "sess_1",
          message: "follow up",
        },
        () => undefined,
      ),
    ).rejects.toMatchObject({
      code: "SESSION_BUSY",
    });

    deferred.resolve();
    await firstTurn;
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}
