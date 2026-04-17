import type { AcpKimiChatRequest } from "../../modules/acp-kimi/acp-kimi.dto.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import {
  createKimiAcpSessionRuntime,
  type KimiAcpSessionRuntime,
  type KimiAcpRuntimeDeps,
} from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import type {
  KimiSessionRecord,
  KimiSessionRegistry,
} from "../../adapters/kimi-acp/kimi-session-registry.js";
import { inMemoryKimiSessionRegistry } from "../../adapters/kimi-acp/in-memory-kimi-session-registry.js";
import { logger } from "../../logger.js";

const acpKimiProxyLogger = logger.child({ module: "acp-kimi-proxy" });

export interface AcpKimiProxyServiceDeps {
  createSessionRuntime?: (
    deps?: KimiAcpRuntimeDeps,
  ) => Promise<KimiAcpSessionRuntime>;
  sessionRegistry?: KimiSessionRegistry;
}

export interface AcpKimiProxyService {
  assertSessionAccess(
    input: Pick<AcpKimiChatRequest, "operatorLarkId" | "sessionId">,
  ): KimiSessionRecord | null | void | Promise<KimiSessionRecord | null | void>;
  chat(
    input: AcpKimiChatRequest,
    emit: (event: AcpKimiStreamEvent) => void,
    deps?: {
      signal?: AbortSignal;
      session?: KimiSessionRecord | null;
    },
  ): Promise<void>;
}

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
    deps.createSessionRuntime ?? createKimiAcpSessionRuntime;
  const sessionRegistry = deps.sessionRegistry ?? inMemoryKimiSessionRegistry;

  return {
    assertSessionAccess(input) {
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

      const session = getOwnedSession(
        sessionRegistry,
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
    async chat(
      input: AcpKimiChatRequest,
      emit: (event: AcpKimiStreamEvent) => void,
      deps?: {
        signal?: AbortSignal;
        session?: KimiSessionRecord | null;
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
        ? getOwnedSession(sessionRegistry, input.sessionId, input.operatorLarkId)
        : await createOwnedSession(
            sessionRegistry,
            createSessionRuntime,
            input.operatorLarkId,
            deps?.signal,
          );

      acpKimiProxyLogger.info({
        operatorLarkId: input.operatorLarkId,
        sessionId: session.sessionId,
        reusedSession: Boolean(input.sessionId || deps?.session),
      }, "ACP_KIMI_CHAT SESSION_READY");

      if (!input.sessionId) {
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
        }, "ACP_KIMI_CHAT SESSION_CREATED_EVENT");
        emit({
          event: "session.created",
          data: {
            sessionId: session.sessionId,
          },
        });
      }

      if (!deps?.session) {
        assertSessionNotBusy(session);
      }

      session.busy = true;
      try {
        acpKimiProxyLogger.info({
          operatorLarkId: input.operatorLarkId,
          sessionId: session.sessionId,
        }, "ACP_KIMI_CHAT PROMPT_START");
        const promptResult = await session.runtime.prompt({
          message: input.message,
          emit,
          signal: deps?.signal,
        });

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
        await sessionRegistry.delete(session.sessionId);
        throw error;
      } finally {
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
  createSessionRuntime: (
    deps?: KimiAcpRuntimeDeps,
  ) => Promise<KimiAcpSessionRuntime>,
  operatorLarkId: string,
  signal?: AbortSignal,
): Promise<KimiSessionRecord> {
  acpKimiProxyLogger.info({
    operatorLarkId,
    cwd: process.cwd(),
  }, "ACP_KIMI_CREATE_SESSION START");
  const runtime = await createSessionRuntime({ signal });
  const session = {
    sessionId: runtime.sessionId,
    operatorLarkId,
    runtime,
    busy: false,
  } satisfies KimiSessionRecord;

  sessionRegistry.set(session);
  acpKimiProxyLogger.info({
    operatorLarkId,
    sessionId: session.sessionId,
  }, "ACP_KIMI_CREATE_SESSION OK");
  return session;
}

function getOwnedSession(
  sessionRegistry: KimiSessionRegistry,
  sessionId: string,
  operatorLarkId: string,
): KimiSessionRecord {
  acpKimiProxyLogger.info({
    operatorLarkId,
    sessionId,
  }, "ACP_KIMI_GET_OWNED_SESSION START");
  const session = sessionRegistry.get(sessionId);

  if (!session) {
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

  if (session.operatorLarkId !== operatorLarkId) {
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

  acpKimiProxyLogger.info({
    operatorLarkId,
    sessionId,
    busy: session.busy,
  }, "ACP_KIMI_GET_OWNED_SESSION OK");
  return session;
}
