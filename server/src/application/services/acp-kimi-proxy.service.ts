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
      if (!input.sessionId) {
        return null;
      }

      const session = getOwnedSession(
        sessionRegistry,
        input.sessionId,
        input.operatorLarkId,
      );
      assertSessionNotBusy(session);
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

      if (!input.sessionId) {
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
        const promptResult = await session.runtime.prompt({
          message: input.message,
          emit,
          signal: deps?.signal,
        });

        emit({
          event: "done",
          data: {
            sessionId: session.sessionId,
            stopReason: promptResult.stopReason,
          },
        });
        sessionRegistry.touch(session.sessionId);
      } catch (error) {
        await sessionRegistry.delete(session.sessionId);
        throw error;
      } finally {
        session.busy = false;
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
  const runtime = await createSessionRuntime({ signal });
  const session = {
    sessionId: runtime.sessionId,
    operatorLarkId,
    runtime,
    busy: false,
  } satisfies KimiSessionRecord;

  sessionRegistry.set(session);
  return session;
}

function getOwnedSession(
  sessionRegistry: KimiSessionRegistry,
  sessionId: string,
  operatorLarkId: string,
): KimiSessionRecord {
  const session = sessionRegistry.get(sessionId);

  if (!session) {
    throw new AcpKimiProxyError(
      "SESSION_NOT_FOUND",
      404,
      `Kimi ACP session ${sessionId} was not found.`,
    );
  }

  if (session.operatorLarkId !== operatorLarkId) {
    throw new AcpKimiProxyError(
      "SESSION_FORBIDDEN",
      403,
      `Kimi ACP session ${sessionId} does not belong to ${operatorLarkId}.`,
    );
  }

  return session;
}
