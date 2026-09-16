import {
  createAcpKimiProxyService,
  type AcpKimiProxyServiceDeps,
} from "./acp-kimi-proxy.service.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      agentProvider: "kimi_acp",
      agentSessionId: "sess_reusable",
      operatorLarkId: "ou_1",
      runtimeHostName: "octo-server-1",
      kimiWorkDir: "/srv/octo/server",
      automationActionKey: "acp.chat",
      permissionProfileId: "acp.chat-readonly.v1",
      permissionProfileVersion: "1",
      skillProfile: null,
      skillId: null,
      actionRunId: null,
    });
  });

  it("binds a quick action policy to the runtime and ownership snapshot", async () => {
    const runtime = {
      sessionId: "sess_policy",
      prompt: vi.fn(async ({ emit }) => {
        emit({ event: "acp.session.update", data: { sessionId: "sess_policy", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Answer" } } } });
        return { stopReason: "end_turn" };
      }),
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
      agentProvider: "hermes_acp",
      operatorLarkId: "ou_1",
      message: "Summarize this ticket",
      permissionContext: {
        actionKey: "lark-ticket-support-qa-answer",
        permissionProfileId: "support-qa.answer.v1",
        permissionProfileVersion: "1",
        workspaceDir: "/srv/odoo/eu",
        scratchDir: "/tmp/octo-support-qa/action_1",
        skillProfile: "support_qa_eu",
        skillId: "support_qa_query",
        ticketNumber: "LT-10",
        actionRunId: "action_1",
      },
    }, vi.fn());

    expect(createSessionRuntime).toHaveBeenCalledWith(expect.objectContaining({
      agentProvider: "hermes_acp",
      cwd: "/srv/odoo/eu",
    }));
    expect(deps.ownershipStore.claim).toHaveBeenCalledWith(expect.objectContaining({
      kimiWorkDir: "/srv/odoo/eu",
      automationActionKey: "lark-ticket-support-qa-answer",
      permissionProfileId: "support-qa.answer.v1",
      permissionProfileVersion: "1",
      skillProfile: "support_qa_eu",
      skillId: "support_qa_query",
      actionRunId: "action_1",
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

describe("Hermes permission terminal states", () => {
  it("auto-approves a structured safe edit without emitting an interactive permission request", async () => {
    const root = await mkdtemp(join(tmpdir(), "octo-hermes-safe-edit-"));
    const entity = join(root, "docs/llm-wiki/entities/account-move.md");
    await mkdir(join(root, "docs/llm-wiki/entities"), { recursive: true });
    await writeFile(entity, "before");
    try {
      let permissionResponse: unknown;
      const runtime = {
        sessionId: "public", agentSessionId: "native", agentProvider: "hermes_acp" as const, close: vi.fn(),
        prompt: vi.fn(async ({ emit, permissionHandler }) => {
          permissionResponse = await permissionHandler({
            sessionId: "native",
            options: [{ optionId: "allow_once", name: "Allow edit", kind: "allow_once" }, { optionId: "deny", name: "Deny", kind: "reject_once" }],
            toolCall: {
              toolCallId: "edit-approval-1", title: `Approve edit: ${entity}`, kind: "edit", status: "pending",
              content: [{ type: "diff", path: entity, oldText: "before", newText: "after" }],
              rawInput: { tool: "patch", arguments: { path: entity, mode: "replace", old_string: "before", new_string: "after" } },
            },
          });
          emit({ event: "acp.session.update", data: { sessionId: "public", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Updated." } } } });
          return { stopReason: "end_turn" };
        }),
      };
      const deps = createProxyDeps();
      const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
      const events: Array<{ event: string }> = [];

      await service.chat({
        agentProvider: "hermes_acp", operatorLarkId: "ou_1", message: "update", actionRunId: "run-safe-edit",
        permissionContext: {
          actionKey: "lark-ticket-support-qa-document-preview",
          permissionProfileId: "support-qa.document.v1",
          permissionProfileVersion: "1",
          workspaceDir: root,
          actionRunId: "run-safe-edit",
        },
      }, (event) => events.push(event));

      expect(permissionResponse).toEqual({ outcome: { outcome: "selected", optionId: "allow_once" } });
      expect(events.some((event) => event.event === "acp.permission.requested")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["", "   \n"])("rejects a Hermes end_turn without an answer instead of emitting done: %j", async (text) => {
    const deps = createProxyDeps();
    deps.ownershipStore.updateRun = vi.fn();
    const runtime = {
      sessionId: "public", agentProvider: "hermes_acp" as const, close: vi.fn(),
      prompt: vi.fn(async ({ emit }) => {
        emit({ event: "acp.session.update", data: { sessionId: "public", update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } } } });
        emit({ event: "acp.session.update", data: { sessionId: "public", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
        return { stopReason: "end_turn" };
      }),
    };
    const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
    const emit = vi.fn();
    await expect(service.chat({ operatorLarkId: "ou_1", message: "run", actionRunId: "run-1" }, emit)).rejects.toMatchObject({ code: "ACP_EMPTY_RESULT", stage: "adapter.acp.prompt" });
    expect(emit.mock.calls.some(([event]) => event.event === "done")).toBe(false);
    expect(deps.ownershipStore.updateRun).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "public", status: "failed", errorCode: "ACP_EMPTY_RESULT" }));
    expect(deps.sessionRegistry.delete).toHaveBeenCalledWith("public");
  });

  it("completes Hermes after a nonempty assistant reply", async () => {
    const deps = createProxyDeps();
    const runtime = {
      sessionId: "public", agentProvider: "hermes_acp" as const, close: vi.fn(),
      prompt: vi.fn(async ({ emit }) => {
        emit({ event: "acp.session.update", data: { sessionId: "public", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "The answer." } } } });
        return { stopReason: "end_turn" };
      }),
    };
    const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
    const emit = vi.fn();
    await service.chat({ operatorLarkId: "ou_1", message: "run" }, emit);
    expect(emit).toHaveBeenCalledWith({ event: "done", data: { sessionId: "public", stopReason: "end_turn" } });
  });

  it("persists background permission failure even when the agent returns end_turn", async () => {
    const deps = createProxyDeps();
    deps.ownershipStore.updateRun = vi.fn();
    const runtime = {
      sessionId: "octo-session", agentSessionId: "native-session", agentProvider: "hermes_acp" as const,
      close: vi.fn(),
      prompt: vi.fn(async ({ permissionHandler }) => {
        await permissionHandler({ sessionId: "native-session", toolCall: { toolCallId: "tool", title: "Bash" }, options: [{ optionId: "once", name: "Once", kind: "allow_once" }] });
        return { stopReason: "end_turn" };
      }),
    };
    const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
    const emit = vi.fn();
    await expect(service.chat({ operatorLarkId: "ou_1", message: "run", agentProvider: "hermes_acp", runMode: "background", actionRunId: "run-1" }, emit)).rejects.toMatchObject({ code: "ACP_PERMISSION_CONFIGURATION_REQUIRED" });
    expect(emit.mock.calls.some(([event]) => event.event === "done")).toBe(false);
    expect(deps.ownershipStore.updateRun).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "octo-session", status: "failed", errorCode: "ACP_PERMISSION_CONFIGURATION_REQUIRED" }));
  });

  it("persists native metadata before prompting and closes an unclaimed runtime", async () => {
    const deps = createProxyDeps();
    vi.mocked(deps.ownershipStore.claim).mockRejectedValue(new Error("database unavailable"));
    const runtime = { sessionId: "public", agentSessionId: "native", agentProvider: "hermes_acp" as const, prompt: vi.fn(), close: vi.fn() };
    const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
    await expect(service.chat({ operatorLarkId: "ou_1", message: "run" }, vi.fn())).rejects.toThrow("database unavailable");
    expect(deps.ownershipStore.claim).toHaveBeenCalledWith(expect.objectContaining({ agentProvider: "hermes_acp", agentSessionId: "native" }));
    expect(runtime.prompt).not.toHaveBeenCalled();
    expect(deps.sessionRegistry.set).not.toHaveBeenCalled();
    expect(runtime.close).toHaveBeenCalledOnce();
  });

  it("cleans up and preserves the run failure if failure persistence also fails", async () => {
    const deps = createProxyDeps();
    deps.ownershipStore.updateRun = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const failure = Object.assign(new Error("agent failed"), { code: "ACP_AGENT_RUN_FAILED" });
    const runtime = { sessionId: "public", prompt: vi.fn().mockRejectedValue(failure), close: vi.fn() };
    vi.mocked(deps.sessionRegistry.delete).mockImplementation(() => runtime.close());
    const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
    await expect(service.chat({ operatorLarkId: "ou_1", message: "run" }, vi.fn())).rejects.toBe(failure);
    expect(runtime.close).toHaveBeenCalledOnce();
  });
});

it("awaits business association before prompt and refuses a competing turn while attaching", async () => {
  const deps = createProxyDeps();
  let record: Parameters<NonNullable<AcpKimiProxyServiceDeps["sessionRegistry"]>["set"]>[0] | undefined;
  vi.mocked(deps.sessionRegistry.set).mockImplementation((value) => { record = value; });
  vi.mocked(deps.sessionRegistry.get).mockImplementation(() => record);
  const runtime = { sessionId: "public", prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }), close: vi.fn() };
  const service = createAcpKimiProxyService({ ...deps, createSessionRuntime: vi.fn().mockResolvedValue(runtime) });
  let finish!: () => void;
  const attaching = new Promise<void>((resolve) => { finish = resolve; });
  const onSessionCreated = vi.fn(() => attaching);
  const pending = service.chat({ operatorLarkId: "ou_1", message: "run" }, vi.fn(), { onSessionCreated });
  await vi.waitFor(() => expect(onSessionCreated).toHaveBeenCalled());
  expect(runtime.prompt).not.toHaveBeenCalled();
  await expect(service.chat({ operatorLarkId: "ou_1", sessionId: "public", message: "race" }, vi.fn())).rejects.toMatchObject({ code: "SESSION_BUSY" });
  finish();
  await pending;
  expect(runtime.prompt).toHaveBeenCalledOnce();
});
