import {
  KimiAcpRuntimeError,
  createKimiAcpSessionRuntime,
  type KimiAcpConnection,
} from "./kimi-acp-runtime.js";

describe("kimi acp runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out initialize and closes the connection", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const connection = {
      initialize: vi.fn(() => new Promise<never>(() => {})),
      newSession: vi.fn(),
      listSessions: vi.fn(),
      loadSession: vi.fn(),
      prompt: vi.fn(),
      close,
    } satisfies KimiAcpConnection;

    const runtimePromise = createKimiAcpSessionRuntime({
      env: {
        ...process.env,
        KIMI_ACP_STARTUP_TIMEOUT_MS: "25",
      },
      createConnection: () => connection,
    });
    const expectation = expect(runtimePromise).rejects.toMatchObject({
      name: "KimiAcpRuntimeError",
      code: "ACP_INITIALIZE_TIMEOUT",
      stage: "adapter.acp.initialize",
    } satisfies Partial<KimiAcpRuntimeError>);

    await vi.advanceTimersByTimeAsync(25);

    await expectation;
    expect(close).toHaveBeenCalledTimes(1);
    expect(connection.newSession).not.toHaveBeenCalled();
  });
});
