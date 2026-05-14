import * as acp from "@agentclientprotocol/sdk";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { buildKimiAcpRuntimeConfig, type KimiAcpSpawnConfig } from "./kimi-acp-config.js";
import {
  evaluatePermissionRequest,
  selectAutoAllowOption,
  selectAutoRejectOption,
} from "../../application/services/acp-kimi-permission-policy.service.js";
import { cleanupAgentProcess } from "./process-lifecycle.js";
import type { AcpKimiChatRequest } from "../../modules/acp-kimi/acp-kimi.dto.js";
import type {
  AcpKimiStreamEvent,
  AcpKimiSessionUpdateEvent,
} from "../../modules/acp-kimi/event-stream.js";
import { acpLogger } from "../../logger.js";

const kimiAcpRuntimeLogger = acpLogger.child({ module: "kimi-acp-runtime" });

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
  listSessions(input: {
    cwd?: string;
    cursor?: string | null;
  }): Promise<{
    sessions: Array<Record<string, unknown>>;
    nextCursor?: string | null;
  }>;
  loadSession(input: {
    sessionId: string;
    cwd: string;
  }): Promise<Record<string, unknown>>;
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
  yolo?: boolean;
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
  sessionId?: string;
  yolo?: boolean;
}

export interface KimiAcpSessionRuntime {
  sessionId: string;
  prompt(input: {
    message: string;
    emit: (event: AcpKimiStreamEvent) => void;
    signal?: AbortSignal;
  }): Promise<{ stopReason: string }>;
  close(): Promise<void>;
}

export interface KimiAcpSessionSummary {
  sessionId: string;
  cwd?: string | null;
  title?: string | null;
  updatedAt?: string | null;
}

export async function createKimiAcpSessionRuntime(
  deps: KimiAcpRuntimeDeps = {},
): Promise<KimiAcpSessionRuntime> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const spawnConfig =
    deps.buildSpawnConfig?.(env) ?? buildKimiAcpRuntimeConfig(env);
  let emit = deps.emit ?? (() => {});

  throwIfAborted(deps.signal);
  kimiAcpRuntimeLogger.info({
    cwd,
    command: spawnConfig.command,
    args: spawnConfig.args,
  }, "KIMI_ACP_RUNTIME CREATE START");
  const connection = await (deps.createConnection
    ? deps.createConnection({
        spawnConfig,
        cwd,
        emit(event) {
          emit(event);
        },
        signal: deps.signal,
        yolo: deps.yolo,
      })
    : createDefaultConnection(
        {
          spawnConfig,
          cwd,
          emit(event) {
            emit(event);
          },
          signal: deps.signal,
          yolo: deps.yolo,
        },
        deps.spawnProcess,
      ));
  const closeConnection = createCloseOnce(connection);

  try {
    throwIfAborted(deps.signal);
    await connection.initialize();
    kimiAcpRuntimeLogger.info({
      cwd,
      command: spawnConfig.command,
    }, "KIMI_ACP_RUNTIME INITIALIZE OK");
    throwIfAborted(deps.signal);

    const session = deps.sessionId
      ? {
          sessionId: deps.sessionId,
          ...(await connection.loadSession({
            sessionId: deps.sessionId,
            cwd,
          })),
        }
      : await connection.newSession({
          cwd,
        });
    kimiAcpRuntimeLogger.info({
      cwd,
      sessionId: session.sessionId,
      loaded: Boolean(deps.sessionId),
    }, deps.sessionId ? "KIMI_ACP_RUNTIME LOAD_SESSION OK" : "KIMI_ACP_RUNTIME NEW_SESSION OK");

    return {
      sessionId: session.sessionId,
      async prompt(input) {
        emit = input.emit;
        kimiAcpRuntimeLogger.info({
          sessionId: session.sessionId,
          messageLength: input.message.length,
        }, "KIMI_ACP_RUNTIME PROMPT START");

        try {
          const result = await runPromptWithAbort(
            connection,
            session.sessionId,
            input.message,
            input.signal,
            closeConnection,
          );
          kimiAcpRuntimeLogger.info({
            sessionId: session.sessionId,
            stopReason: result.stopReason,
          }, "KIMI_ACP_RUNTIME PROMPT OK");
          return result;
        } finally {
          emit = () => {};
        }
      },
      async close() {
        kimiAcpRuntimeLogger.info({
          sessionId: session.sessionId,
        }, "KIMI_ACP_RUNTIME CLOSE");
        await closeConnection();
      },
    };
  } catch (error) {
    kimiAcpRuntimeLogger.error({
      cwd,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, "KIMI_ACP_RUNTIME CREATE ERROR");
    await closeConnection();
    throw error;
  }
}

export async function listKimiAcpSessions(
  deps: Pick<
    KimiAcpRuntimeDeps,
    "cwd" | "env" | "buildSpawnConfig" | "spawnProcess" | "createConnection" | "signal"
  > = {},
): Promise<KimiAcpSessionSummary[]> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const spawnConfig =
    deps.buildSpawnConfig?.(env) ?? buildKimiAcpRuntimeConfig(env);
  const connection = await (deps.createConnection
    ? deps.createConnection({
        spawnConfig,
        cwd,
        emit() {},
        signal: deps.signal,
      })
    : createDefaultConnection(
        {
          spawnConfig,
          cwd,
          emit() {},
          signal: deps.signal,
        },
        deps.spawnProcess,
      ));
  const closeConnection = createCloseOnce(connection);

  try {
    await connection.initialize();
    const sessions: KimiAcpSessionSummary[] = [];
    let cursor: string | null | undefined = null;

    do {
      const page = await connection.listSessions({
        cwd,
        cursor,
      });

      for (const session of page.sessions) {
        sessions.push(normalizeSessionSummary(session));
      }

      cursor = page.nextCursor ?? null;
    } while (cursor);

    return sessions;
  } finally {
    await closeConnection();
  }
}

export async function runKimiAcpSingleTurn(
  input: AcpKimiChatRequest,
  deps: KimiAcpRuntimeDeps = {},
): Promise<void> {
  const emit = deps.emit ?? (() => {});
  const runtime = await createKimiAcpSessionRuntime({
    ...deps,
    emit,
  });

  try {
    emit({
      event: "session.created",
      data: {
        sessionId: runtime.sessionId,
      },
    });

    const promptResult = await runtime.prompt({
      message: input.message,
      emit,
      signal: deps.signal,
    });

    emit({
      event: "done",
      data: {
        sessionId: runtime.sessionId,
        stopReason: promptResult.stopReason,
      },
    });
  } catch (error) {
    await runtime.close();
    throw error;
  } finally {
    await runtime.close();
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
  kimiAcpRuntimeLogger.info({
    pid: agentProcess.pid,
    cwd: input.cwd,
    command: input.spawnConfig.command,
    args: input.spawnConfig.args,
  }, "KIMI_ACP_PROCESS SPAWNED");
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
    () => new CollectingClient(input.emit, input.yolo ?? false),
    stream,
  );

  return {
    async initialize() {
      await ensureProcessStarted();
      kimiAcpRuntimeLogger.info({
        pid: agentProcess.pid,
      }, "KIMI_ACP_CONNECTION INITIALIZE");
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
      kimiAcpRuntimeLogger.info({
        pid: agentProcess.pid,
        cwd,
      }, "KIMI_ACP_CONNECTION NEW_SESSION");
      return connection.newSession({
        cwd,
        mcpServers: [],
      });
    },
    async listSessions(input: { cwd?: string; cursor?: string | null }) {
      await ensureProcessStarted();
      return (await connection.listSessions({
        cwd: input.cwd,
        cursor: input.cursor ?? undefined,
      })) as {
        sessions: Array<Record<string, unknown>>;
        nextCursor?: string | null;
      };
    },
    async loadSession({ sessionId, cwd }: { sessionId: string; cwd: string }) {
      await ensureProcessStarted();
      return (await connection.loadSession({
        sessionId,
        cwd,
        mcpServers: [],
      })) as Record<string, unknown>;
    },
    async prompt({
      sessionId,
      prompt,
    }: {
      sessionId: string;
      prompt: string;
    }) {
      await ensureProcessStarted();
      kimiAcpRuntimeLogger.info({
        pid: agentProcess.pid,
        sessionId,
        promptLength: prompt.length,
      }, "KIMI_ACP_CONNECTION PROMPT");
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
      kimiAcpRuntimeLogger.info({
        pid: agentProcess.pid,
      }, "KIMI_ACP_CONNECTION CLOSE");
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
      kimiAcpRuntimeLogger.warn({
        sessionId,
      }, "KIMI_ACP_RUNTIME PROMPT_ABORT");
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

// Module-level pending permission request registry
interface PendingPermissionRequest {
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const pendingPermissionRequests = new Map<string, PendingPermissionRequest>();

const PERMISSION_PROMPT_TIMEOUT_MS = 30000;

export function respondToPermissionRequest(
  sessionId: string,
  optionId: string,
): boolean {
  const pending = pendingPermissionRequests.get(sessionId);
  if (!pending) {
    return false;
  }
  clearTimeout(pending.timeoutId);
  pendingPermissionRequests.delete(sessionId);
  pending.resolve({
    outcome: {
      outcome: "selected" as const,
      optionId,
    },
  });
  return true;
}

class CollectingClient implements acp.Client {
  constructor(
    private readonly emit: (event: AcpKimiStreamEvent) => void,
    private readonly yolo: boolean = false,
  ) {}

  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const policy = evaluatePermissionRequest(params);
    const sessionId = params.sessionId;

    // Yolo mode: auto-allow everything except high-risk
    if (this.yolo && policy.action !== "auto_reject") {
      const allowOption = selectAutoAllowOption(params.options);
      if (allowOption) {
        kimiAcpRuntimeLogger.info(
          {
            sessionId,
            toolCallId: params.toolCall.toolCallId,
            optionId: allowOption.optionId,
            reason: "yolo mode auto-allow",
          },
          "KIMI_ACP_CLIENT PERMISSION_YOLO_ALLOWED",
        );
        return {
          outcome: {
            outcome: "selected" as const,
            optionId: allowOption.optionId,
          },
        };
      }
    }

    // High risk: auto-reject
    if (policy.action === "auto_reject") {
      const rejectOption = selectAutoRejectOption(params.options);
      if (rejectOption) {
        kimiAcpRuntimeLogger.warn(
          {
            sessionId,
            toolCallId: params.toolCall.toolCallId,
            optionId: rejectOption.optionId,
            reason: policy.reason,
          },
          "KIMI_ACP_CLIENT PERMISSION_AUTO_REJECTED",
        );
        return {
          outcome: {
            outcome: "selected" as const,
            optionId: rejectOption.optionId,
          },
        };
      }
      kimiAcpRuntimeLogger.warn(
        {
          sessionId,
          toolCallId: params.toolCall.toolCallId,
          reason: policy.reason,
        },
        "KIMI_ACP_CLIENT PERMISSION_AUTO_REJECTED_NO_OPTION",
      );
      return {
        outcome: {
          outcome: "cancelled" as const,
        },
      };
    }

    // Low risk: auto-allow
    if (policy.action === "auto_allow") {
      const allowOption = selectAutoAllowOption(params.options);
      if (allowOption) {
        kimiAcpRuntimeLogger.info(
          {
            sessionId,
            toolCallId: params.toolCall.toolCallId,
            optionId: allowOption.optionId,
            reason: policy.reason,
          },
          "KIMI_ACP_CLIENT PERMISSION_AUTO_ALLOWED",
        );
        return {
          outcome: {
            outcome: "selected" as const,
            optionId: allowOption.optionId,
          },
        };
      }
    }

    // Medium risk: prompt user via SSE
    const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, _reject) => {
      const timeoutId = setTimeout(() => {
        pendingPermissionRequests.delete(sessionId);
        kimiAcpRuntimeLogger.warn(
          {
            sessionId,
            requestId,
            toolCallId: params.toolCall.toolCallId,
          },
          "KIMI_ACP_CLIENT PERMISSION_TIMEOUT",
        );
        resolve({
          outcome: {
            outcome: "cancelled" as const,
          },
        });
      }, PERMISSION_PROMPT_TIMEOUT_MS);

      pendingPermissionRequests.set(sessionId, { resolve, reject: _reject, timeoutId });

      this.emit({
        event: "acp.permission.request",
        data: {
          sessionId,
          requestId,
          toolCall: {
            title: params.toolCall.title ?? "Unknown operation",
            kind: params.toolCall.kind ?? "other",
            rawInput: params.toolCall.rawInput,
          },
          options: params.options.map((o) => ({
            optionId: o.optionId,
            kind: o.kind,
            name: o.name,
          })),
          riskLevel: policy.riskLevel,
          reason: policy.reason,
        },
      });

      kimiAcpRuntimeLogger.info(
        {
          sessionId,
          requestId,
          toolCallId: params.toolCall.toolCallId,
          title: params.toolCall.title,
          riskLevel: policy.riskLevel,
        },
        "KIMI_ACP_CLIENT PERMISSION_PROMPTED",
      );
    });
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    kimiAcpRuntimeLogger.info({
      sessionId: params.sessionId,
      sessionUpdate:
        params.update &&
        typeof params.update === "object" &&
        "sessionUpdate" in (params.update as Record<string, unknown>)
          ? (params.update as Record<string, unknown>).sessionUpdate
          : undefined,
    }, "KIMI_ACP_CLIENT SESSION_UPDATE");
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

  return update as Record<string, unknown>;
}

function normalizeSessionSummary(session: Record<string, unknown>): KimiAcpSessionSummary {
  const sessionId =
    typeof session.sessionId === "string"
      ? session.sessionId
      : typeof session.id === "string"
        ? session.id
        : "";

  return {
    sessionId,
    cwd: typeof session.cwd === "string" ? session.cwd : null,
    title: typeof session.title === "string" ? session.title : null,
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : null,
  };
}
