import { describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";

describe("runKimiAcpSingleTurn", () => {
  it("emits session.created, one update, and done in order", async () => {
    const { runKimiAcpSingleTurn } = await import(
      "../src/adapters/kimi-acp/kimi-acp-runtime.js"
    );

    const emitted = [] as Array<Record<string, unknown>>;
    const deferred = createDeferred<void>();
    const createConnection = vi.fn(async ({ emit }) => {
      const sessionId = "sess_1";

      return {
        initialize: vi.fn().mockResolvedValue({
          protocolVersion: 1,
          agentCapabilities: { mcpCapabilities: { http: true } },
        }),
        newSession: vi.fn().mockResolvedValue({
          sessionId,
        }),
        prompt: vi.fn(async () => {
          emit({
            event: "acp.session.update",
            data: {
              sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: "你好",
                },
              },
            },
          });

          await deferred.promise;

          return {
            stopReason: "end_turn",
          };
        }),
        close: vi.fn(),
      };
    });

    const runtimePromise = runKimiAcpSingleTurn(
      {
        operatorLarkId: "ou_123",
        message: "请介绍一下会话状态",
      },
      {
        cwd: "/workspace",
        createConnection,
        emit(event) {
          emitted.push(event as Record<string, unknown>);
        },
      },
    );

    await vi.waitFor(() => {
      expect(emitted).toHaveLength(2);
    });

    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([
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
    ]);

    deferred.resolve();
    await runtimePromise;

    expect(emitted).toEqual([
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

  it("cleans up the agent process when aborted mid-turn", async () => {
    const { runKimiAcpSingleTurn } = await import(
      "../src/adapters/kimi-acp/kimi-acp-runtime.js"
    );

    const abortController = new AbortController();
    const close = vi.fn();
    const promptStarted = createDeferred<void>();
    const createConnection = vi.fn(async () => {
      return {
        initialize: vi.fn().mockResolvedValue({
          protocolVersion: 1,
        }),
        newSession: vi.fn().mockResolvedValue({
          sessionId: "sess_1",
        }),
        prompt: vi.fn(async () => {
          promptStarted.resolve();
          await new Promise<void>(() => {});
        }),
        close,
      };
    });

    const runtimePromise = runKimiAcpSingleTurn(
      {
        operatorLarkId: "ou_123",
        message: "请介绍一下会话状态",
      },
      {
        cwd: "/workspace",
        createConnection,
        signal: abortController.signal,
      },
    );

    await vi.waitFor(() => {
      expect(createConnection).toHaveBeenCalledTimes(1);
    });

    await promptStarted.promise;

    abortController.abort();

    await expect(runtimePromise).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects cleanly when the kimi command cannot be spawned", async () => {
    const { runKimiAcpSingleTurn } = await import(
      "../src/adapters/kimi-acp/kimi-acp-runtime.js"
    );

    const spawnProcess = vi.fn(() => {
      const process = createFakeAgentProcess();

      queueMicrotask(() => {
        const error = new Error("spawn kimi ENOENT");
        process.emit("error", error);
      });

      return process as never;
    });

    await expect(
      runKimiAcpSingleTurn(
        {
          operatorLarkId: "ou_123",
          message: "请介绍一下会话状态",
        },
        {
          cwd: "/workspace",
          spawnProcess,
        },
      ),
    ).rejects.toThrow(/failed to start.*ENOENT/i);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return {
    promise,
    resolve,
  };
}

function createFakeAgentProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const process = {
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    on(event: string, listener: (...args: unknown[]) => void) {
      const next = listeners.get(event) ?? [];
      next.push(listener);
      listeners.set(event, next);
      return process;
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      const wrapped = (...args: unknown[]) => {
        process.off(event, wrapped);
        listener(...args);
      };

      return process.on(event, wrapped);
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
      return process;
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    },
    kill(signal?: NodeJS.Signals) {
      process.signalCode = signal ?? "SIGTERM";
      process.emit("exit", null, process.signalCode);
      return true;
    },
  };

  return process;
}
