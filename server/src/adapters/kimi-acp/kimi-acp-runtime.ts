import * as acp from "@agentclientprotocol/sdk";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { buildKimiAcpRuntimeConfig, type KimiAcpSpawnConfig } from "./kimi-acp-config.js";
import { cleanupAgentProcess } from "./process-lifecycle.js";
import type { AcpKimiChatRequest } from "../../modules/acp-kimi/acp-kimi.dto.js";
import type {
  AcpKimiStreamEvent,
  AcpKimiSessionUpdateEvent,
} from "../../modules/acp-kimi/event-stream.js";

export interface KimiAcpConnection {
  initialize(): Promise<{
    protocolVersion: number;
    agentCapabilities?: {
      mcpCapabilities?: {
        http?: boolean;
        sse?: boolean;
      };
    };
  }>;
  newSession(input: { cwd: string }): Promise<{ sessionId: string }>;
  prompt(input: {
    sessionId: string;
    prompt: string;
  }): Promise<{ stopReason: string }>;
  close?(): Promise<void> | void;
}

export interface KimiAcpConnectionFactoryInput {
  spawnConfig: KimiAcpSpawnConfig;
  cwd: string;
  emit(event: AcpKimiStreamEvent): void;
  signal?: AbortSignal;
}

export interface KimiAcpRuntimeDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  buildSpawnConfig?: (env: NodeJS.ProcessEnv) => KimiAcpSpawnConfig;
  spawnProcess?: typeof spawn;
  createConnection?: (
    input: KimiAcpConnectionFactoryInput,
  ) => Promise<KimiAcpConnection> | KimiAcpConnection;
  emit?: (event: AcpKimiStreamEvent) => void;
  signal?: AbortSignal;
}

export async function runKimiAcpSingleTurn(
  input: AcpKimiChatRequest,
  deps: KimiAcpRuntimeDeps = {},
): Promise<void> {
  const emit = deps.emit ?? (() => {});
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const spawnConfig =
    deps.buildSpawnConfig?.(env) ?? buildKimiAcpRuntimeConfig(env);
  throwIfAborted(deps.signal);
  const connection = await (deps.createConnection
    ? deps.createConnection({ spawnConfig, cwd, emit, signal: deps.signal })
    : createDefaultConnection(
        { spawnConfig, cwd, emit, signal: deps.signal },
        deps.spawnProcess,
      ));
  const closeConnection = createCloseOnce(connection);

  try {
    throwIfAborted(deps.signal);
    await connection.initialize();
    throwIfAborted(deps.signal);

    const session = await connection.newSession({
      cwd,
    });

    emit({
      event: "session.created",
      data: {
        sessionId: session.sessionId,
      },
    });

    const promptResult = await runPromptWithAbort(
      connection,
      session.sessionId,
      input.message,
      deps.signal,
      closeConnection,
    );

    emit({
      event: "done",
      data: {
        sessionId: session.sessionId,
        stopReason: promptResult.stopReason,
      },
    });
  } catch (error) {
    await closeConnection();
    throw error;
  } finally {
    await closeConnection();
  }
}

async function createDefaultConnection(
  input: KimiAcpConnectionFactoryInput,
  spawnProcess: typeof spawn = spawn,
) {
  const agentProcess = spawnProcess(input.spawnConfig.command, input.spawnConfig.args, {
    env: input.spawnConfig.env,
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
  const ensureProcessStarted = createProcessStartupGuard(agentProcess);

  agentProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[kimi-acp:stderr] ${String(chunk)}`);
  });

  const inputStream = toBinaryWritableStream(
    Writable.toWeb(agentProcess.stdin),
  );
  const outputStream = toBinaryReadableStream(
    Readable.toWeb(agentProcess.stdout),
  );
  const stream = acp.ndJsonStream(inputStream, outputStream) as unknown as ConstructorParameters<
    typeof acp.ClientSideConnection
  >[1];

  const connection = new acp.ClientSideConnection(
    () => new CollectingClient(input.emit),
    stream,
  );

  return {
    async initialize() {
      await ensureProcessStarted();
      return connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientInfo: {
          name: "tenways-octo-kimi",
          version: "0.1.0",
        },
        clientCapabilities: {},
      });
    },
    async newSession({ cwd }: { cwd: string }) {
      await ensureProcessStarted();
      return connection.newSession({
        cwd,
        mcpServers: [],
      });
    },
    async prompt({
      sessionId,
      prompt,
    }: {
      sessionId: string;
      prompt: string;
    }) {
      await ensureProcessStarted();
      return connection.prompt({
        sessionId,
        prompt: [
          {
            type: "text",
            text: prompt,
          },
        ],
      });
    },
    async close() {
      await cleanupAgentProcess(agentProcess as ChildProcessWithoutNullStreams);
    },
  } satisfies KimiAcpConnection;
}

async function runPromptWithAbort(
  connection: KimiAcpConnection,
  sessionId: string,
  prompt: string,
  signal?: AbortSignal,
  closeConnection?: () => Promise<void>,
): Promise<{ stopReason: string }> {
  if (!signal) {
    return connection.prompt({
      sessionId,
      prompt,
    });
  }

  if (signal.aborted) {
    throw abortError();
  }

  return await new Promise<{ stopReason: string }>((resolve, reject) => {
    const handleAbort = () => {
      void (closeConnection ? closeConnection() : connection.close?.());
      reject(abortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    void connection
      .prompt({
        sessionId,
        prompt,
      })
      .then(
        (result) => {
          signal.removeEventListener("abort", handleAbort);
          resolve(result);
        },
        (error) => {
          signal.removeEventListener("abort", handleAbort);
          reject(error);
        },
      );
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}

function toBinaryWritableStream(
  stream: unknown,
): WritableStream<Uint8Array> {
  return stream as unknown as WritableStream<Uint8Array>;
}

function toBinaryReadableStream(
  stream: unknown,
): ReadableStream<Uint8Array> {
  return stream as unknown as ReadableStream<Uint8Array>;
}

function createCloseOnce(connection: KimiAcpConnection): () => Promise<void> {
  let closed = false;

  return async () => {
    if (closed) {
      return;
    }

    closed = true;
    await connection.close?.();
  };
}

function createProcessStartupGuard(
  agentProcess: Pick<ChildProcessWithoutNullStreams, "once">,
): () => Promise<void> {
  let startupError: Error | null = null;
  let startupSettled = false;
  let resolveStartup!: () => void;

  const startupPromise = new Promise<void>((resolve) => {
    resolveStartup = resolve;
  });

  const handleStartError = (error: Error) => {
    if (startupSettled) {
      return;
    }

    startupSettled = true;
    startupError = new Error(`failed to start kimi acp: ${error.message}`);
    resolveStartup();
  };

  agentProcess.once("error", handleStartError);
  queueMicrotask(() => {
    if (startupSettled) {
      return;
    }

    startupSettled = true;
    resolveStartup();
  });

  return async () => {
    await startupPromise;

    if (startupError) {
      throw startupError;
    }
  };
}

class CollectingClient implements acp.Client {
  constructor(private readonly emit: (event: AcpKimiStreamEvent) => void) {}

  async requestPermission(
    _params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    return {
      outcome: {
        outcome: "cancelled" as const,
      },
    };
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.emit({
      event: "acp.session.update",
      data: {
        sessionId: params.sessionId,
        update: normalizeSessionUpdate(params.update),
      },
    } satisfies AcpKimiSessionUpdateEvent);
  }
}

function normalizeSessionUpdate(update: unknown): Record<string, unknown> {
  if (!update || typeof update !== "object") {
    return { update };
  }

  const record = update as Record<string, unknown>;
  if (record.sessionUpdate === "agent_message_chunk") {
    const content = record.content as
      | {
          type?: string;
          text?: string;
        }
      | undefined;

    if (content?.type === "text" && typeof content.text === "string") {
      return {
        content: content.text,
      };
    }
  }

  return record;
}
