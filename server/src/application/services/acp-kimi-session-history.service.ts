import {
  createKimiAcpSessionRuntime,
  listKimiAcpSessions,
  type KimiAcpRuntimeDeps,
  type KimiAcpSessionSummary,
} from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import { exportKimiSessionEvents } from "../../adapters/kimi-acp/session-export.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import {
  getAcpKimiSessionOwnershipStore,
  type AcpKimiSessionOwnershipStore,
} from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import { inMemoryKimiSessionRegistry } from "../../adapters/kimi-acp/in-memory-kimi-session-registry.js";
import type { KimiSessionRegistry } from "../../adapters/kimi-acp/kimi-session-registry.js";
import { AcpKimiProxyError } from "./acp-kimi-proxy.service.js";

export interface AcpKimiSessionHistoryServiceDeps {
  ownershipStore?: AcpKimiSessionOwnershipStore;
  sessionRegistry?: KimiSessionRegistry;
  listSessions?: (
    deps?: Pick<
      KimiAcpRuntimeDeps,
      "cwd" | "env" | "buildSpawnConfig" | "spawnProcess" | "createConnection" | "signal"
    >,
  ) => Promise<KimiAcpSessionSummary[]>;
  createSessionRuntime?: (
    deps?: KimiAcpRuntimeDeps,
  ) => ReturnType<typeof createKimiAcpSessionRuntime>;
  exportSessionEvents?: (sessionId: string) => Promise<AcpKimiStreamEvent[]>;
}

export function createAcpKimiSessionHistoryService(
  deps: AcpKimiSessionHistoryServiceDeps = {},
) {
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const sessionRegistry = deps.sessionRegistry ?? inMemoryKimiSessionRegistry;
  const listSessions = deps.listSessions ?? listKimiAcpSessions;
  const createSessionRuntime = deps.createSessionRuntime ?? createKimiAcpSessionRuntime;
  const exportSessionEvents = deps.exportSessionEvents ?? exportKimiSessionEvents;

  return {
    async listSessions(input: { operatorLarkId: string }) {
      const discoveredSessions = await listSessions({
        cwd: process.cwd(),
      });

      for (const session of discoveredSessions) {
        const existing = await ownershipStore.getBySessionId(session.sessionId);
        if (!existing) {
          await ownershipStore.claim(session.sessionId, input.operatorLarkId);
        }
      }

      const ownedSessions = await ownershipStore.listByOperatorLarkId(
        input.operatorLarkId,
      );
      const ownedSessionIds = new Set(ownedSessions.map((session) => session.sessionId));

      return discoveredSessions
        .filter((session) => ownedSessionIds.has(session.sessionId))
        .sort((left, right) =>
          (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
        );
    },

    async loadSession(input: {
      operatorLarkId: string;
      sessionId: string;
      signal?: AbortSignal;
    }) {
      await assertOwnership(ownershipStore, input.sessionId, input.operatorLarkId);

      const existingSession = sessionRegistry.get(input.sessionId);
      if (existingSession && existingSession.busy) {
        throw new AcpKimiProxyError(
          "SESSION_BUSY",
          409,
          `Kimi ACP session ${input.sessionId} is already handling a prompt.`,
        );
      }

      if (existingSession) {
        await sessionRegistry.delete(input.sessionId);
      }

      const events: AcpKimiStreamEvent[] = [
        {
          event: "session.created",
          data: {
            sessionId: input.sessionId,
          },
        },
      ];
      const runtime = await createSessionRuntime({
        signal: input.signal,
        sessionId: input.sessionId,
        emit(event) {
          events.push(event);
        },
      });

      sessionRegistry.set({
        sessionId: runtime.sessionId,
        operatorLarkId: input.operatorLarkId,
        runtime,
        busy: false,
      });

      const hasReplayEvents = events.some(
        (event) => event.event === "acp.session.update",
      );
      if (!hasReplayEvents) {
        try {
          events.push(...await exportSessionEvents(input.sessionId));
        } catch {
          // Fall back to the loaded runtime even if export-based history recovery fails.
        }
      }

      return {
        sessionId: input.sessionId,
        events,
      };
    },

    async deleteSession(input: {
      operatorLarkId: string;
      sessionId: string;
    }) {
      const deleted = await ownershipStore.deleteForOperator(
        input.sessionId,
        input.operatorLarkId,
      );

      if (!deleted) {
        throw new AcpKimiProxyError(
          "SESSION_NOT_FOUND",
          404,
          `Kimi ACP session ${input.sessionId} was not found.`,
        );
      }

      const liveSession = sessionRegistry.get(input.sessionId);
      if (liveSession?.operatorLarkId === input.operatorLarkId) {
        await sessionRegistry.delete(input.sessionId);
      }

      return {
        ok: true,
      };
    },
  };
}

export const acpKimiSessionHistoryService = createAcpKimiSessionHistoryService();

async function assertOwnership(
  ownershipStore: AcpKimiSessionOwnershipStore,
  sessionId: string,
  operatorLarkId: string,
): Promise<void> {
  const ownedSession = await ownershipStore.getBySessionId(sessionId);

  if (!ownedSession || ownedSession.deletedAt) {
    throw new AcpKimiProxyError(
      "SESSION_NOT_FOUND",
      404,
      `Kimi ACP session ${sessionId} was not found.`,
    );
  }

  if (ownedSession.operatorLarkId !== operatorLarkId) {
    throw new AcpKimiProxyError(
      "SESSION_FORBIDDEN",
      403,
      `Kimi ACP session ${sessionId} does not belong to ${operatorLarkId}.`,
    );
  }
}
