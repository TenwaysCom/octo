import { AcpRuntimeError } from "../../adapters/acp/acp-runtime.js";
import { randomUUID } from "node:crypto";
import { acpPermissionService, type AcpRunMode } from "./acp-permission.service.js";
import { hostname } from "node:os";
import { createManagedAcpSessionRuntime, resolveAcpSessionIdentity, type AcpAgentProvider } from "../../adapters/acp/managed-acp-runtime.js";
import type { AcpKimiChatRequest } from "../../modules/acp-kimi/acp-kimi.dto.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import {
  type KimiAcpSessionRuntime,
  type KimiAcpRuntimeDeps,
} from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import type {
  KimiSessionRecord,
  KimiSessionRegistry,
} from "../../adapters/kimi-acp/kimi-session-registry.js";
import { inMemoryKimiSessionRegistry } from "../../adapters/kimi-acp/in-memory-kimi-session-registry.js";
import {
  getAcpKimiSessionOwnershipStore,
  type AcpKimiSessionOwnershipStore,
} from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import { logger } from "../../logger.js";
import {
  buildAcpKimiScratchDir,
  createAcpKimiClientCapabilityPolicy,
  createAcpKimiPermissionHandler,
  tryAutoApproveAcpHermesEdit,
  type AcpKimiPermissionContext,
} from "./acp-kimi-permission-policy.js";
import {
  ACP_CHAT_ACTION_KEY,
  getAcpKimiPermissionProfile,
  isAcpKimiPermissionProfileId,
} from "../../domain/acp-kimi-permission-profile.js";

const acpKimiProxyLogger = logger.child({ module: "acp-kimi-proxy" });

export interface AcpKimiProxyServiceDeps {
  createSessionRuntime?: (
    deps?: KimiAcpRuntimeDeps,
  ) => Promise<KimiAcpSessionRuntime>;
  sessionRegistry?: KimiSessionRegistry;
  permissionService?: typeof acpPermissionService;
  ownershipStore?: AcpKimiSessionOwnershipStore;
  getRuntimeLocation?: () => {
    runtimeHostName: string;
    kimiWorkDir: string;
  };
}

export interface AcpKimiProxyService {
  assertSessionAccess(
    input: Pick<AcpKimiChatRequest, "operatorLarkId" | "sessionId">,
  ): KimiSessionRecord | null | void | Promise<KimiSessionRecord | null | void>;
  chatOneShot(
    input: Pick<AcpKimiChatRequest, "operatorLarkId" | "message">,
    emit: (event: AcpKimiStreamEvent) => void,
    deps?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;
  chat(
    input: AcpKimiManagedChatRequest,
    emit: (event: AcpKimiStreamEvent) => void,
    deps?: {
      signal?: AbortSignal;
      session?: KimiSessionRecord | null;
      onSessionCreated?: (session: KimiSessionRecord) => Promise<void>;
    },
  ): Promise<void>;
}

export type AcpKimiManagedChatRequest = AcpKimiChatRequest & {
  permissionContext?: AcpKimiPermissionContext;
  agentProvider?: AcpAgentProvider;
  runMode?: AcpRunMode;
};

export class AcpKimiProxyError extends Error {
  constructor(
    readonly code: "SESSION_BUSY" | "SESSION_FORBIDDEN" | "SESSION_NOT_FOUND",
    readonly statusCode: 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "AcpKimiProxyError";
  }
}

export function createAcpKimiProxyService(
  deps: AcpKimiProxyServiceDeps = {},
): AcpKimiProxyService {
  const createSessionRuntime =
    deps.createSessionRuntime ?? createManagedAcpSessionRuntime;
  const sessionRegistry = deps.sessionRegistry ?? inMemoryKimiSessionRegistry;
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const permissionService = deps.permissionService ?? acpPermissionService;
  const getRuntimeLocation = deps.getRuntimeLocation ?? (() => ({
    runtimeHostName: hostname(),
    kimiWorkDir: process.cwd(),
  }));

  return {
    async assertSessionAccess(input) {
      acpKimiProxyLogger.info({
        operatorLarkId: input.operatorLarkId,
        hasSessionId: Boolean(input.sessionId),
        sessionId: input.sessionId,
      }, "ACP_KIMI_ASSERT_SESSION_ACCESS START");
      if (!input.sessionId) {
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
        }, "ACP_KIMI_ASSERT_SESSION_ACCESS NEW_SESSION");
        return null;
      }

      const session = await getOwnedSession(
        sessionRegistry,
        ownershipStore,
        createSessionRuntime,
        input.sessionId,
        input.operatorLarkId,
      );
      assertSessionNotBusy(session);
      acpKimiProxyLogger.info({
        operatorLarkId: input.operatorLarkId,
        sessionId: session.sessionId,
      }, "ACP_KIMI_ASSERT_SESSION_ACCESS OK");
      return session;
    },
    async chatOneShot(
      input: Pick<AcpKimiChatRequest, "operatorLarkId" | "message">,
      emit: (event: AcpKimiStreamEvent) => void,
      deps?: {
        signal?: AbortSignal;
      },
    ) {
      acpKimiProxyLogger.info({
        operatorLarkId: input.operatorLarkId,
        messageLength: input.message.length,
      }, "ACP_KIMI_ONESHOT START");

      let runtime: KimiAcpSessionRuntime | undefined;
      try {
        runtime = await createSessionRuntime({
          signal: deps?.signal,
        });
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: runtime.sessionId,
        }, "ACP_KIMI_ONESHOT SESSION_READY");
        emit({
          event: "session.created",
          data: {
            sessionId: runtime.sessionId,
          },
        });

        const promptResult = await runtime.prompt({
          message: input.message,
          emit,
          signal: deps?.signal,
        });

        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: runtime.sessionId,
          stopReason: promptResult.stopReason,
        }, "ACP_KIMI_ONESHOT PROMPT_DONE");
        emit({
          event: "done",
          data: {
            sessionId: runtime.sessionId,
            stopReason: promptResult.stopReason,
          },
        });
      } catch (error) {
        acpKimiProxyLogger.error({
          operatorLarkId: input.operatorLarkId,
          sessionId: runtime?.sessionId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, "ACP_KIMI_ONESHOT ERROR");
        throw error;
      } finally {
        if (runtime) {
          acpKimiProxyLogger.info({
            operatorLarkId: input.operatorLarkId,
            sessionId: runtime.sessionId,
          }, "ACP_KIMI_ONESHOT CLOSE");
          await runtime.close();
        }
      }
    },
    async chat(
      input: AcpKimiManagedChatRequest,
      emit: (event: AcpKimiStreamEvent) => void,
      deps?: {
        signal?: AbortSignal;
        session?: KimiSessionRecord | null;
        onSessionCreated?: (session: KimiSessionRecord) => Promise<void>;
      },
    ) {
      acpKimiProxyLogger.info({
        operatorLarkId: input.operatorLarkId,
        hasSessionId: Boolean(input.sessionId),
        sessionId: input.sessionId,
        messageLength: input.message.length,
        hasPreloadedSession: Boolean(deps?.session),
      }, "ACP_KIMI_CHAT START");
      const session = deps?.session
        ? deps.session
        : input.sessionId
        ? await getOwnedSession(
            sessionRegistry,
            ownershipStore,
            createSessionRuntime,
            input.sessionId,
            input.operatorLarkId,
          )
        : await createOwnedSession(
            sessionRegistry,
            ownershipStore,
            createSessionRuntime,
            input.operatorLarkId,
            getRuntimeLocation,
            input.permissionContext,
            deps?.signal,
            input.agentProvider,
          );

      acpKimiProxyLogger.info({
        operatorLarkId: input.operatorLarkId,
        sessionId: session.sessionId,
        reusedSession: Boolean(input.sessionId || deps?.session),
      }, "ACP_KIMI_CHAT SESSION_READY");

      if (session.operatorLarkId !== input.operatorLarkId || (input.sessionId && session.sessionId !== input.sessionId)) {
        throw new AcpKimiProxyError("SESSION_FORBIDDEN", 403, "Session does not belong to this request.");
      }
      assertSessionNotBusy(session);
      session.busy = true;
      const actionRunId = input.actionRunId ?? session.permissionContext?.actionRunId ?? randomUUID();
      const abort = new AbortController();
      const onAbort = () => abort.abort();
      deps?.signal?.addEventListener("abort", onAbort, { once: true });
      if (deps?.signal?.aborted) abort.abort();
      const agentProvider = session.agentProvider ?? session.runtime.agentProvider ?? resolveAcpSessionIdentity({ sessionId: session.sessionId }).agentProvider;
      const permissionRun = permissionService.beginRun({
        operatorLarkId: input.operatorLarkId,
        sessionId: session.sessionId,
        agentSessionId: session.agentSessionId ?? session.runtime.agentSessionId ?? session.runtime.sessionId,
        actionRunId,
        mode: input.runMode ?? "interactive",
        emit,
        signal: abort.signal,
        cancel: onAbort,
      });
      try {
        if (!input.sessionId) {
          await deps?.onSessionCreated?.(session);
          emit({ event: "session.created", data: { sessionId: session.sessionId } });
        }
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
        }, "ACP_KIMI_CHAT PROMPT_START");
        let hasAssistantOutput = false;
        const promptResult = await session.runtime.prompt({
          message: input.message,
          emit(event) {
            if (event.event === "acp.session.update" && event.data.update.sessionUpdate === "agent_message_chunk") {
              const content = event.data.update.content;
              if (content && typeof content === "object" && "text" in content && typeof content.text === "string" && content.text.trim()) {
                hasAssistantOutput = true;
              }
            }
            emit(event);
          },
          signal: abort.signal,
          ...(agentProvider === "hermes_acp" ? {
            permissionHandler: async (params) => await tryAutoApproveAcpHermesEdit(params, session.permissionContext)
              ?? permissionRun.request(params),
          } : {}),
        });
        permissionRun.assertCompleted();
        if (agentProvider === "hermes_acp" && promptResult.stopReason !== "end_turn") {
          throw new AcpRuntimeError("ACP_AGENT_RUN_INCOMPLETE", "adapter.acp.prompt", `Agent stopped with ${promptResult.stopReason}; the run was not completed.`);
        }
        if (abort.signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        if (agentProvider === "hermes_acp" && !hasAssistantOutput) {
          throw new AcpRuntimeError("ACP_EMPTY_RESULT", "adapter.acp.prompt", "Hermes 未返回回答，本轮未完成。请检查 Hermes 的模型认证配置及 Server 运行日志后重新执行。");
        }

        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
          stopReason: promptResult.stopReason,
        }, "ACP_KIMI_CHAT PROMPT_DONE");

        emit({
          event: "done",
          data: {
            sessionId: session.sessionId,
            stopReason: promptResult.stopReason,
          },
        });
        sessionRegistry.touch(session.sessionId);
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
        }, "ACP_KIMI_CHAT TOUCH_SESSION");
      } catch (error) {
        acpKimiProxyLogger.error({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, "ACP_KIMI_CHAT ERROR");
        const failure = permissionRun.failure ?? error;
        try {
          if (failure instanceof Error && "code" in failure) {
            await ownershipStore.updateRun?.({
              sessionId: session.sessionId, operatorLarkId: input.operatorLarkId, actionRunId,
              status: "failed", errorCode: String(failure.code), errorMessage: failure.message,
            });
          }
        } catch (persistError) {
          acpKimiProxyLogger.error({ sessionId: session.sessionId, actionRunId, errorMessage: String(persistError) }, "ACP_CHAT_FAILURE_PERSIST_ERROR");
        }
        try {
          await sessionRegistry.delete(session.sessionId);
        } catch (closeError) {
          acpKimiProxyLogger.error({ sessionId: session.sessionId, actionRunId, errorMessage: String(closeError) }, "ACP_CHAT_FAILURE_CLOSE_ERROR");
        }
        throw failure;
      } finally {
        permissionRun.close();
        deps?.signal?.removeEventListener("abort", onAbort);
        session.busy = false;
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
        }, "ACP_KIMI_CHAT FINALLY");
      }
    },
  };
}

function assertSessionNotBusy(session: KimiSessionRecord): void {
  if (session.busy) {
    throw new AcpKimiProxyError(
      "SESSION_BUSY",
      409,
      `Kimi ACP session ${session.sessionId} is already handling a prompt.`,
    );
  }
}

export const acpKimiProxyService = createAcpKimiProxyService();

async function createOwnedSession(
  sessionRegistry: KimiSessionRegistry,
  ownershipStore: AcpKimiSessionOwnershipStore,
  createSessionRuntime: (
    deps?: KimiAcpRuntimeDeps,
  ) => Promise<KimiAcpSessionRuntime>,
  operatorLarkId: string,
  getRuntimeLocation: () => {
    runtimeHostName: string;
    kimiWorkDir: string;
  },
  permissionContext: AcpKimiPermissionContext | undefined,
  signal?: AbortSignal,
  agentProvider?: AcpAgentProvider,
): Promise<KimiSessionRecord> {
  const effectivePermissionContext: AcpKimiPermissionContext = permissionContext ?? {
    actionKey: ACP_CHAT_ACTION_KEY,
    permissionProfileId: "acp.chat-readonly.v1" as const,
    permissionProfileVersion: getAcpKimiPermissionProfile("acp.chat-readonly.v1")!.version,
  };
  const runtimeLocation = getRuntimeLocation();
  const workDir = effectivePermissionContext.workspaceDir ?? runtimeLocation.kimiWorkDir;
  acpKimiProxyLogger.info({
    operatorLarkId,
    cwd: workDir,
    actionKey: effectivePermissionContext.actionKey,
    permissionProfileId: effectivePermissionContext.permissionProfileId,
    permissionProfileVersion: effectivePermissionContext.permissionProfileVersion,
  }, "ACP_KIMI_CREATE_SESSION START");
  const runtime = await createSessionRuntime({
    agentProvider,
    cwd: workDir,
    ...(agentProvider !== "hermes_acp" ? {
      capabilityPolicy: createAcpKimiClientCapabilityPolicy(effectivePermissionContext),
      permissionHandler: createAcpKimiPermissionHandler(effectivePermissionContext),
    } : {}),
    signal,
  });
  const session = {
    sessionId: runtime.sessionId,
    agentProvider: runtime.agentProvider ?? agentProvider ?? "kimi_acp",
    agentSessionId: runtime.agentSessionId ?? runtime.sessionId,
    operatorLarkId,
    runtime,
    permissionContext: effectivePermissionContext,
    busy: false,
  } satisfies KimiSessionRecord;

  try {
    await ownershipStore.claim({
      sessionId: session.sessionId,
      agentProvider: runtime.agentProvider ?? agentProvider ?? "kimi_acp",
      agentSessionId: runtime.agentSessionId ?? runtime.sessionId,
      operatorLarkId,
      runtimeHostName: runtimeLocation.runtimeHostName,
      kimiWorkDir: workDir,
      automationActionKey: effectivePermissionContext.actionKey,
      permissionProfileId: effectivePermissionContext.permissionProfileId,
      permissionProfileVersion: effectivePermissionContext.permissionProfileVersion,
      skillProfile: effectivePermissionContext.skillProfile ?? null,
      skillId: effectivePermissionContext.skillId ?? null,
      actionRunId: effectivePermissionContext.actionRunId ?? null,
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
  sessionRegistry.set(session);
  acpKimiProxyLogger.info({
    operatorLarkId,
    sessionId: session.sessionId,
  }, "ACP_KIMI_CREATE_SESSION OK");
  return session;
}

async function getOwnedSession(
  sessionRegistry: KimiSessionRegistry,
  ownershipStore: AcpKimiSessionOwnershipStore,
  createSessionRuntime: (
    deps?: KimiAcpRuntimeDeps,
  ) => Promise<KimiAcpSessionRuntime>,
  sessionId: string,
  operatorLarkId: string,
): Promise<KimiSessionRecord> {
  acpKimiProxyLogger.info({
    operatorLarkId,
    sessionId,
  }, "ACP_KIMI_GET_OWNED_SESSION START");
  const session = sessionRegistry.get(sessionId);

  if (session && session.operatorLarkId !== operatorLarkId) {
    acpKimiProxyLogger.warn({
      operatorLarkId,
      sessionId,
      ownerOperatorLarkId: session.operatorLarkId,
    }, "ACP_KIMI_GET_OWNED_SESSION FORBIDDEN");
    throw new AcpKimiProxyError(
      "SESSION_FORBIDDEN",
      403,
      `Kimi ACP session ${sessionId} does not belong to ${operatorLarkId}.`,
    );
  }

  if (session) {
    acpKimiProxyLogger.info({
      operatorLarkId,
      sessionId,
      busy: session.busy,
    }, "ACP_KIMI_GET_OWNED_SESSION OK");
    return session;
  }

  const ownership = await ownershipStore.getBySessionId(sessionId);
  if (!ownership || ownership.deletedAt) {
    acpKimiProxyLogger.warn({
      operatorLarkId,
      sessionId,
    }, "ACP_KIMI_GET_OWNED_SESSION NOT_FOUND");
    throw new AcpKimiProxyError(
      "SESSION_NOT_FOUND",
      404,
      `Kimi ACP session ${sessionId} was not found.`,
    );
  }

  if (ownership.operatorLarkId !== operatorLarkId) {
    acpKimiProxyLogger.warn({
      operatorLarkId,
      sessionId,
      ownerOperatorLarkId: ownership.operatorLarkId,
    }, "ACP_KIMI_GET_OWNED_SESSION FORBIDDEN");
    throw new AcpKimiProxyError(
      "SESSION_FORBIDDEN",
      403,
      `Kimi ACP session ${sessionId} does not belong to ${operatorLarkId}.`,
    );
  }

  const permissionContext = toPermissionContext(ownership);
  const identity = resolveAcpSessionIdentity(ownership);
  const runtime = await createSessionRuntime({
    sessionId,
    ...identity,
    cwd: ownership.kimiWorkDir ?? process.cwd(),
    ...(identity.agentProvider === "kimi_acp" ? {
      capabilityPolicy: createAcpKimiClientCapabilityPolicy(permissionContext),
      permissionHandler: createAcpKimiPermissionHandler(permissionContext),
    } : {}),
  });
  const restoredSession = {
    sessionId,
    ...identity,
    operatorLarkId,
    runtime,
    permissionContext,
    busy: false,
  } satisfies KimiSessionRecord;
  sessionRegistry.set(restoredSession);

  acpKimiProxyLogger.info({
    operatorLarkId,
    sessionId,
    busy: restoredSession.busy,
  }, "ACP_KIMI_GET_OWNED_SESSION OK");
  return restoredSession;
}

export function toPermissionContext(
  ownership: Awaited<ReturnType<AcpKimiSessionOwnershipStore["getBySessionId"]>>,
): AcpKimiPermissionContext | undefined {
  if (!ownership) {
    return undefined;
  }
  const permissionProfileId = isAcpKimiPermissionProfileId(ownership.permissionProfileId)
    ? ownership.permissionProfileId
    : null;
  return {
    actionKey: ownership.automationActionKey,
    permissionProfileId,
    permissionProfileVersion: ownership.permissionProfileVersion,
    workspaceDir: ownership.kimiWorkDir,
    scratchDir: ownership.actionRunId ? buildAcpKimiScratchDir(ownership.actionRunId) : null,
    skillProfile: ownership.skillProfile,
    skillId: ownership.skillId,
    ticketNumber: ownership.ticketNumber,
    ticketRecordId: ownership.ticketRecordId,
    actionRunId: ownership.actionRunId,
    legacySession: !permissionProfileId,
  };
}
