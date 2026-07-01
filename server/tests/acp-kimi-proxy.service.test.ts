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
    const ownershipStore = createOwnershipStoreMock();
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
      ownershipStore,
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
    expect(ownershipStore.claim).toHaveBeenCalledWith("sess_1", "ou_123");
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
    const ownershipStore = createOwnershipStoreMock();
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
      ownershipStore,
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
    const ownershipStore = createOwnershipStoreMock();
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
      ownershipStore,
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

  it("keeps the session alive after aborting a turn so the next turn can continue", async () => {
    const { createAcpKimiProxyService } = await import(
      "../src/application/services/acp-kimi-proxy.service.js"
    );
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const registry = createInMemoryKimiSessionRegistry();
    const abortController = new AbortController();
    const promptStarted = createDeferred<void>();
    const prompt = vi
      .fn()
      .mockImplementationOnce(async ({ signal }: { signal?: AbortSignal }) => {
        promptStarted.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
        return { stopReason: "end_turn" };
      })
      .mockResolvedValueOnce({ stopReason: "end_turn" });
    const runtime = {
      sessionId: "sess_1",
      prompt,
      close: vi.fn(),
    };
    const ownershipStore = createOwnershipStoreMock();
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      createSessionRuntime,
      sessionRegistry: registry,
      ownershipStore,
    });

    const firstTurn = service.chat(
      {
        operatorLarkId: "ou_123",
        message: "first turn",
      },
      () => undefined,
      {
        signal: abortController.signal,
      },
    );

    await promptStarted.promise;
    abortController.abort();

    await expect(firstTurn).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(registry.get("sess_1")).toMatchObject({
      sessionId: "sess_1",
      operatorLarkId: "ou_123",
    });

    await service.chat(
      {
        operatorLarkId: "ou_123",
        sessionId: "sess_1",
        message: "follow up",
      },
      () => undefined,
    );

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: "follow up",
      }),
    );
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function createOwnershipStoreMock() {
  return {
    claim: vi.fn(async (sessionId: string, operatorLarkId: string) => ({
      sessionId,
      operatorLarkId,
      deletedAt: null,
    })),
    getBySessionId: vi.fn(async (sessionId: string) => ({
      sessionId,
      operatorLarkId: "ou_123",
      deletedAt: null,
    })),
    listByOperatorLarkId: vi.fn(async () => []),
    deleteForOperator: vi.fn(async () => true),
  };
}
