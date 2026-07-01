import { describe, expect, it, vi } from "vitest";

describe("in-memory kimi session registry", () => {
  it("stores and deletes live sessions by bridge session id", async () => {
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const registry = createInMemoryKimiSessionRegistry();
    const runtime = {
      sessionId: "sess_1",
      prompt: async () => ({ stopReason: "end_turn" }),
      close: async () => undefined,
    };

    registry.set({
      sessionId: "sess_1",
      operatorLarkId: "ou_123",
      runtime,
      busy: false,
    });

    expect(registry.get("sess_1")).toEqual({
      sessionId: "sess_1",
      operatorLarkId: "ou_123",
      runtime,
      busy: false,
    });

    await registry.delete("sess_1");

    expect(registry.get("sess_1")).toBeUndefined();
  });

  it("expires idle sessions and closes their runtimes", async () => {
    vi.useFakeTimers();

    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const close = vi.fn(async () => undefined);
    const registry = createInMemoryKimiSessionRegistry({
      idleMs: 100,
    });

    registry.set({
      sessionId: "sess_1",
      operatorLarkId: "ou_123",
      runtime: {
        sessionId: "sess_1",
        prompt: async () => ({ stopReason: "end_turn" }),
        close,
      },
      busy: false,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(registry.get("sess_1")).toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
