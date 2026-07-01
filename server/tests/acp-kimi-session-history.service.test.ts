import { describe, expect, it, vi } from "vitest";

describe("acp kimi session history service", () => {
  it("lists only the current operator sessions while claiming unowned ACP sessions", async () => {
    const { createAcpKimiSessionHistoryService } = await import(
      "../src/application/services/acp-kimi-session-history.service.js"
    );

    const ownershipStore = createOwnershipStoreMock({
      listByOperatorLarkId: vi.fn().mockResolvedValue([
        {
          sessionId: "sess_owned",
          operatorLarkId: "ou_123",
          deletedAt: null,
        },
        {
          sessionId: "sess_orphan",
          operatorLarkId: "ou_123",
          deletedAt: null,
        },
      ]),
      getBySessionId: vi
        .fn()
        .mockResolvedValueOnce({
          sessionId: "sess_owned",
          operatorLarkId: "ou_123",
          deletedAt: null,
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          sessionId: "sess_other",
          operatorLarkId: "ou_other",
          deletedAt: null,
        }),
      claim: vi.fn(async (sessionId: string, operatorLarkId: string) => ({
        sessionId,
        operatorLarkId,
        deletedAt: null,
      })),
    });

    const listSessions = vi.fn().mockResolvedValue([
      {
        sessionId: "sess_owned",
        cwd: "/workspace",
        title: "Owned",
        updatedAt: "2026-04-18T00:00:00Z",
      },
      {
        sessionId: "sess_orphan",
        cwd: "/workspace",
        title: "Orphan",
        updatedAt: "2026-04-18T00:01:00Z",
      },
      {
        sessionId: "sess_other",
        cwd: "/workspace",
        title: "Other",
        updatedAt: "2026-04-18T00:02:00Z",
      },
    ]);

    const service = createAcpKimiSessionHistoryService({
      ownershipStore,
      listSessions,
    });

    const sessions = await service.listSessions({
      operatorLarkId: "ou_123",
    });

    expect(listSessions).toHaveBeenCalledWith({
      cwd: process.cwd(),
    });
    expect(ownershipStore.claim).toHaveBeenCalledTimes(1);
    expect(ownershipStore.claim).toHaveBeenCalledWith("sess_orphan", "ou_123", "Orphan");
    expect(sessions).toEqual([
      {
        sessionId: "sess_orphan",
        cwd: "/workspace",
        title: "Orphan",
        updatedAt: "2026-04-18T00:01:00Z",
      },
      {
        sessionId: "sess_owned",
        cwd: "/workspace",
        title: "Owned",
        updatedAt: "2026-04-18T00:00:00Z",
      },
    ]);
  });

  it("loads a stored session via ACP and returns replayed events", async () => {
    const { createAcpKimiSessionHistoryService } = await import(
      "../src/application/services/acp-kimi-session-history.service.js"
    );
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const ownershipStore = createOwnershipStoreMock({
      getBySessionId: vi.fn().mockResolvedValue({
        sessionId: "sess_1",
        operatorLarkId: "ou_123",
        deletedAt: null,
      }),
    });
    const sessionRegistry = createInMemoryKimiSessionRegistry();
    const runtime = {
      sessionId: "sess_1",
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      close: vi.fn(),
    };
    const createSessionRuntime = vi.fn(async ({ emit }: { emit?: (event: unknown) => void }) => {
      emit?.({
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "user_message_chunk",
            content: {
              type: "text",
              text: "old user message",
            },
          },
        },
      });
      emit?.({
        event: "acp.session.update",
        data: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "old assistant reply",
            },
          },
        },
      });

      return runtime;
    });

    const service = createAcpKimiSessionHistoryService({
      ownershipStore,
      sessionRegistry,
      createSessionRuntime,
    });

    const result = await service.loadSession({
      operatorLarkId: "ou_123",
      sessionId: "sess_1",
    });

    expect(createSessionRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_1",
        signal: undefined,
      }),
    );
    expect(result).toEqual({
      sessionId: "sess_1",
      events: [
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
              sessionUpdate: "user_message_chunk",
              content: {
                type: "text",
                text: "old user message",
              },
            },
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
                text: "old assistant reply",
              },
            },
          },
        },
      ],
    });
    expect(sessionRegistry.get("sess_1")).toMatchObject({
      sessionId: "sess_1",
      operatorLarkId: "ou_123",
      runtime,
    });
  });

  it("falls back to exported session history when ACP load does not replay transcript", async () => {
    const { createAcpKimiSessionHistoryService } = await import(
      "../src/application/services/acp-kimi-session-history.service.js"
    );
    const { createInMemoryKimiSessionRegistry } = await import(
      "../src/adapters/kimi-acp/in-memory-kimi-session-registry.js"
    );

    const ownershipStore = createOwnershipStoreMock({
      getBySessionId: vi.fn().mockResolvedValue({
        sessionId: "sess_exported",
        operatorLarkId: "ou_123",
        deletedAt: null,
      }),
    });
    const sessionRegistry = createInMemoryKimiSessionRegistry();
    const runtime = {
      sessionId: "sess_exported",
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      close: vi.fn(),
    };
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const exportSessionEvents = vi.fn().mockResolvedValue([
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_exported",
          update: {
            sessionUpdate: "user_message_chunk",
            content: {
              type: "text",
              text: "old user message",
            },
          },
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_exported",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "old assistant reply",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_exported",
          stopReason: "end_turn",
        },
      },
    ]);

    const service = createAcpKimiSessionHistoryService({
      ownershipStore,
      sessionRegistry,
      createSessionRuntime,
      exportSessionEvents,
    });

    const result = await service.loadSession({
      operatorLarkId: "ou_123",
      sessionId: "sess_exported",
    });

    expect(exportSessionEvents).toHaveBeenCalledWith("sess_exported");
    expect(result.events).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_exported",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_exported",
          update: {
            sessionUpdate: "user_message_chunk",
            content: {
              type: "text",
              text: "old user message",
            },
          },
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_exported",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "old assistant reply",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_exported",
          stopReason: "end_turn",
        },
      },
    ]);
  });

  it("hides a deleted session from future history listings", async () => {
    const { createAcpKimiSessionHistoryService } = await import(
      "../src/application/services/acp-kimi-session-history.service.js"
    );

    const ownershipStore = createOwnershipStoreMock({
      deleteForOperator: vi.fn().mockResolvedValue(true),
    });
    const service = createAcpKimiSessionHistoryService({
      ownershipStore,
    });

    await expect(
      service.deleteSession({
        operatorLarkId: "ou_123",
        sessionId: "sess_1",
      }),
    ).resolves.toEqual({
      ok: true,
    });

    expect(ownershipStore.deleteForOperator).toHaveBeenCalledWith(
      "sess_1",
      "ou_123",
    );
  });

  it("renames a session and returns the updated title", async () => {
    const { createAcpKimiSessionHistoryService } = await import(
      "../src/application/services/acp-kimi-session-history.service.js"
    );

    const ownershipStore = createOwnershipStoreMock({
      getBySessionId: vi.fn().mockResolvedValue({
        sessionId: "sess_1",
        operatorLarkId: "ou_123",
        title: "Old Title",
        deletedAt: null,
        createdAt: "2026-04-18T00:00:00Z",
        updatedAt: "2026-04-18T00:00:00Z",
      }),
      rename: vi.fn().mockResolvedValue({
        sessionId: "sess_1",
        operatorLarkId: "ou_123",
        title: "新的标题",
        deletedAt: null,
        createdAt: "2026-04-18T00:00:00Z",
        updatedAt: "2026-04-18T01:00:00Z",
      }),
    });
    const service = createAcpKimiSessionHistoryService({
      ownershipStore,
    });

    const result = await service.renameSession({
      operatorLarkId: "ou_123",
      sessionId: "sess_1",
      title: "新的标题",
    });

    expect(ownershipStore.rename).toHaveBeenCalledWith(
      "sess_1",
      "ou_123",
      "新的标题",
    );
    expect(result).toEqual({
      ok: true,
      data: {
        sessionId: "sess_1",
        title: "新的标题",
      },
    });
  });

  it("returns 404 when renaming a non-existent session", async () => {
    const { createAcpKimiSessionHistoryService } = await import(
      "../src/application/services/acp-kimi-session-history.service.js"
    );

    const ownershipStore = createOwnershipStoreMock({
      rename: vi.fn().mockResolvedValue(undefined),
    });
    const service = createAcpKimiSessionHistoryService({
      ownershipStore,
    });

    await expect(
      service.renameSession({
        operatorLarkId: "ou_123",
        sessionId: "sess_not_found",
        title: "新的标题",
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      statusCode: 404,
    });
  });
});

function createOwnershipStoreMock(
  overrides: Record<string, unknown> = {},
) {
  return {
    getBySessionId: vi.fn().mockResolvedValue(undefined),
    listByOperatorLarkId: vi.fn().mockResolvedValue([]),
    claim: vi.fn(async (sessionId: string, operatorLarkId: string) => ({
      sessionId,
      operatorLarkId,
      deletedAt: null,
    })),
    rename: vi.fn().mockResolvedValue(undefined),
    deleteForOperator: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}
