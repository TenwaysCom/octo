import { buildHermesAcpSpawnConfig } from "./hermes-acp-runtime.js";
import { createManagedAcpSessionRuntime } from "../acp/managed-acp-runtime.js";
import type { KimiAcpConnection, KimiAcpConnectionFactoryInput } from "../kimi-acp/kimi-acp-runtime.js";

const HERMES_SESSION = "hermes_11111111-1111-4111-8111-111111111111";

function fixture(sessionId: string) {
  const connection = {
    initialize: vi.fn().mockResolvedValue({}),
    newSession: vi.fn().mockResolvedValue({ sessionId }),
    loadSession: vi.fn().mockResolvedValue({}),
    listSessions: vi.fn().mockResolvedValue({ sessions: [{ sessionId }] }),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    close: vi.fn(),
  } satisfies KimiAcpConnection;
  return { connection, createConnection: vi.fn((_input: KimiAcpConnectionFactoryInput) => connection) };
}

describe("managed Hermes ACP runtime", () => {
  it("starts the official ACP module with Hermes Python and isolated Python import settings", () => {
    const config = buildHermesAcpSpawnConfig({ HERMES_HOME: "/srv/hermes", PYTHONPATH: "/unexpected", PYTHONHOME: "/unexpected" });
    expect(config.command).toBe("/srv/hermes/hermes-agent/venv/bin/python");
    expect(config.args).toEqual(["-m", "acp_adapter"]);
    expect(config.env).toEqual({ HERMES_HOME: "/srv/hermes", PYTHONUNBUFFERED: "1" });
    expect(buildHermesAcpSpawnConfig({ HERMES_ACP_PYTHON: "/opt/venv/bin/python" }).command).toBe("/opt/venv/bin/python");
  });

  it.each([
    { sessionId: undefined, agentProvider: "hermes_acp" as const, expected: "hermes" },
    { sessionId: HERMES_SESSION, agentProvider: undefined, expected: "hermes" },
    { sessionId: "old-kimi-uuid", agentProvider: undefined, expected: "kimi" },
    { sessionId: undefined, agentProvider: undefined, expected: "kimi" },
  ])("routes new and saved sessions by provider and saved identity: $expected / $sessionId", async (input) => {
    const { connection, createConnection } = fixture(input.expected === "hermes" ? HERMES_SESSION : "old-kimi-uuid");
    const runtime = await createManagedAcpSessionRuntime({ ...input, createConnection, env: {} });
    const spawnConfig = createConnection.mock.calls[0][0].spawnConfig;
    expect(spawnConfig.args.includes("acp_adapter")).toBe(input.expected === "hermes");
    expect(input.sessionId ? connection.loadSession : connection.newSession).toHaveBeenCalledOnce();
    await runtime.prompt({ message: "followup", emit: vi.fn() });
    expect(connection.prompt).toHaveBeenCalledWith({ sessionId: input.sessionId ?? runtime.agentSessionId, prompt: "followup" });
    await runtime.close();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("keeps public and native identity separate, including replay and persisted provider overrides", async () => {
    const { connection, createConnection } = fixture("native-id-without-prefix");
    const runtime = await createManagedAcpSessionRuntime({ agentProvider: "hermes_acp", createConnection });
    expect(runtime.sessionId).toMatch(/^hermes_/);
    expect(runtime.agentSessionId).toBe("native-id-without-prefix");
    const emit = vi.fn();
    const restored = await createManagedAcpSessionRuntime({
      sessionId: runtime.sessionId, agentProvider: "hermes_acp", agentSessionId: runtime.agentSessionId,
      createConnection, emit,
    });
    expect(connection.loadSession).toHaveBeenLastCalledWith({ sessionId: "native-id-without-prefix", cwd: process.cwd() });
    createConnection.mock.calls.at(-1)![0].emit({ event: "acp.session.update", data: { sessionId: "native-id-without-prefix", update: {} } });
    expect(emit).toHaveBeenCalledWith({ event: "acp.session.update", data: { sessionId: runtime.sessionId, update: {} } });
    expect(restored.agentProvider).toBe("hermes_acp");
    await runtime.close();
    await restored.close();
  });

  it("waits for ongoing abort cleanup when the caller closes the session", async () => {
    const test = fixture(HERMES_SESSION);
    let finishClose!: () => void;
    test.connection.close.mockImplementation(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    test.connection.prompt.mockImplementation(() => new Promise(() => {}));
    const runtime = await createManagedAcpSessionRuntime({ agentProvider: "hermes_acp", createConnection: test.createConnection });
    const abort = new AbortController();
    const pending = runtime.prompt({ message: "run", emit: vi.fn(), signal: abort.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await rejected;
    let closed = false;
    const closing = runtime.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    finishClose();
    await closing;
    expect(closed).toBe(true);
    expect(test.connection.close).toHaveBeenCalledOnce();
  });
});
