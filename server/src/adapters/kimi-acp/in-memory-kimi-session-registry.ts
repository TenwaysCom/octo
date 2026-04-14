import type {
  KimiSessionRecord,
  KimiSessionRegistry,
} from "./kimi-session-registry.js";

interface InMemorySessionEntry {
  record: KimiSessionRecord;
  timeout: ReturnType<typeof setTimeout> | null;
}

export function createInMemoryKimiSessionRegistry(input?: {
  idleMs?: number;
}): KimiSessionRegistry {
  const idleMs = input?.idleMs ?? 5 * 60_000;
  const sessions = new Map<string, InMemorySessionEntry>();

  const scheduleExpiry = (sessionId: string) => {
    const entry = sessions.get(sessionId);
    if (!entry) {
      return;
    }

    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }

    entry.timeout = setTimeout(() => {
      const current = sessions.get(sessionId);
      if (!current) {
        return;
      }

      if (current.record.busy) {
        scheduleExpiry(sessionId);
        return;
      }

      void deleteSession(sessionId);
    }, idleMs);
  };

  const deleteSession = async (sessionId: string) => {
    const entry = sessions.get(sessionId);
    if (!entry) {
      return;
    }

    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }

    sessions.delete(sessionId);
    await entry.record.runtime.close();
  };

  return {
    get(sessionId) {
      return sessions.get(sessionId)?.record;
    },
    set(record) {
      sessions.set(record.sessionId, {
        record,
        timeout: null,
      });
      scheduleExpiry(record.sessionId);
    },
    touch(sessionId) {
      if (!sessions.has(sessionId)) {
        return;
      }

      scheduleExpiry(sessionId);
    },
    async delete(sessionId) {
      await deleteSession(sessionId);
    },
  };
}

export const inMemoryKimiSessionRegistry = createInMemoryKimiSessionRegistry();
