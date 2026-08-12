import {
  createAcpKimiProxyService,
  type AcpKimiProxyServiceDeps,
} from "./acp-kimi-proxy.service.js";

function createProxyDeps(): Required<
  Pick<AcpKimiProxyServiceDeps, "sessionRegistry" | "ownershipStore">
> {
  return {
    sessionRegistry: {
      get: vi.fn(),
      set: vi.fn(),
      touch: vi.fn(),
      delete: vi.fn(),
    },
    ownershipStore: {
      getBySessionId: vi.fn(),
      listByOperatorLarkId: vi.fn(),
      listByTicket: vi.fn(),
      claim: vi.fn(),
      rename: vi.fn(),
      attachTicket: vi.fn(),
      touch: vi.fn(),
      deleteForOperator: vi.fn(),
    },
  };
}

describe("acp kimi proxy service", () => {
  it("records the server runtime location when creating a reusable session", async () => {
    const runtime = {
      sessionId: "sess_reusable",
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      close: vi.fn(),
    };
    const deps = createProxyDeps();
    const service = createAcpKimiProxyService({
      ...deps,
      createSessionRuntime: vi.fn().mockResolvedValue(runtime),
      getRuntimeLocation: () => ({
        runtimeHostName: "octo-server-1",
        kimiWorkDir: "/srv/octo/server",
      }),
    });

    await service.chat({
      operatorLarkId: "ou_1",
      message: "Summarize this ticket",
    }, vi.fn());

    expect(deps.ownershipStore.claim).toHaveBeenCalledWith({
      sessionId: "sess_reusable",
      operatorLarkId: "ou_1",
      runtimeHostName: "octo-server-1",
      kimiWorkDir: "/srv/octo/server",
      automationActionKey: null,
      executionPolicy: null,
      skillProfile: null,
      skillId: null,
      policyVersion: null,
    });
  });

  it("binds a quick action policy to the runtime and ownership snapshot", async () => {
    const runtime = {
      sessionId: "sess_policy",
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      close: vi.fn(),
    };
    const deps = createProxyDeps();
    const createSessionRuntime = vi.fn().mockResolvedValue(runtime);
    const service = createAcpKimiProxyService({
      ...deps,
      createSessionRuntime,
      getRuntimeLocation: () => ({ runtimeHostName: "octo-server-1", kimiWorkDir: "/srv/octo/server" }),
    });

    await service.chat({
      operatorLarkId: "ou_1",
      message: "Summarize this ticket",
      permissionContext: {
        actionKey: "lark-ticket-support-qa-summarize",
        executionPolicy: "shell",
        workspaceDir: "/srv/odoo/eu",
        skillProfile: "support_qa_eu",
        skillId: "support_qa_query",
        ticketNumber: "LT-10",
        policyVersion: "v1",
      },
    }, vi.fn());

    expect(createSessionRuntime).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/srv/odoo/eu",
      permissionHandler: expect.any(Function),
    }));
    expect(deps.ownershipStore.claim).toHaveBeenCalledWith(expect.objectContaining({
      kimiWorkDir: "/srv/odoo/eu",
      automationActionKey: "lark-ticket-support-qa-summarize",
      executionPolicy: "shell",
      skillProfile: "support_qa_eu",
      skillId: "support_qa_query",
      policyVersion: "v1",
    }));
  });

  it("runs one-shot chats without registering a reusable session and closes the runtime", async () => {
    const runtime = {
      sessionId: "sess_oneshot",
      prompt: vi.fn(async ({ emit }) => {
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "sess_oneshot",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "done",
              },
            },
          },
        });
        return {
          stopReason: "end_turn",
        };
      }),
      close: vi.fn(),
    };
    const deps = createProxyDeps();
    const service = createAcpKimiProxyService({
      ...deps,
      createSessionRuntime: vi.fn().mockResolvedValue(runtime),
    });
    const events: unknown[] = [];

    await service.chatOneShot(
      {
        operatorLarkId: "ou_1",
        message: "summarize this story",
      },
      (event) => {
        events.push(event);
      },
    );

    expect(runtime.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "summarize this story",
      }),
    );
    expect(runtime.close).toHaveBeenCalledTimes(1);
    expect(deps.sessionRegistry.set).not.toHaveBeenCalled();
    expect(deps.ownershipStore.claim).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        event: "session.created",
        data: {
          sessionId: "sess_oneshot",
        },
      },
      {
        event: "acp.session.update",
        data: {
          sessionId: "sess_oneshot",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "done",
            },
          },
        },
      },
      {
        event: "done",
        data: {
          sessionId: "sess_oneshot",
          stopReason: "end_turn",
        },
      },
    ]);
  });
});
