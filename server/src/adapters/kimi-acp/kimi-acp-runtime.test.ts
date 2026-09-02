import {
  KimiAcpRuntimeError,
  createKimiAcpCollectingClient,
  createKimiAcpSessionRuntime,
  type KimiAcpConnection,
} from "./kimi-acp-runtime.js";
import { createAcpKimiPermissionHandler } from "../../application/services/acp-kimi-permission-policy.js";
import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";

describe("kimi acp runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out initialize and closes the connection", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const connection = {
      initialize: vi.fn(() => new Promise<never>(() => {})),
      newSession: vi.fn(),
      listSessions: vi.fn(),
      loadSession: vi.fn(),
      prompt: vi.fn(),
      close,
    } satisfies KimiAcpConnection;

    const runtimePromise = createKimiAcpSessionRuntime({
      env: {
        ...process.env,
        KIMI_ACP_STARTUP_TIMEOUT_MS: "25",
      },
      createConnection: () => connection,
    });
    const expectation = expect(runtimePromise).rejects.toMatchObject({
      name: "KimiAcpRuntimeError",
      code: "ACP_INITIALIZE_TIMEOUT",
      stage: "adapter.acp.initialize",
    } satisfies Partial<KimiAcpRuntimeError>);

    await vi.advanceTimersByTimeAsync(25);

    await expectation;
    expect(close).toHaveBeenCalledTimes(1);
    expect(connection.newSession).not.toHaveBeenCalled();
  });

  it("correlates Kimi 0.38 tool_call rawInput with its truncated permission request", async () => {
    const emit = vi.fn();
    const command = "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json";
    const client = createKimiAcpCollectingClient(
      emit,
      createAcpKimiPermissionHandler({
        actionKey: "lark-ticket-support-qa-summarize",
        executionPolicy: "shell",
        workspaceDir: "/srv/odoo/eu",
        octoServerDir: "/srv/octo/server",
        skillProfile: "support_qa_eu",
        skillId: "support_qa_query",
        ticketNumber: "LT-10",
        policyVersion: "v2",
      }),
    );
    const toolCallId = "12:tool_1";

    await client.sessionUpdate({
      sessionId: "session_1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: "Bash",
        kind: "execute",
        status: "pending",
        content: [{ type: "content", content: { type: "text", text: "{\"command\":\"bash .agents/" } }],
      },
    } as SessionNotification);
    await client.sessionUpdate({
      sessionId: "session_1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        title: "Running: bash .agents/skills/write-support-qa/scripts/write-…",
        kind: "execute",
        status: "in_progress",
        rawInput: { command },
        content: [{ type: "content", content: { type: "text", text: JSON.stringify({ command }) } }],
      },
    } as SessionNotification);

    const request = kimi038PermissionRequest(toolCallId);
    await expect(client.requestPermission(request)).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "approve" },
    });
    await expect(client.requestPermission(request)).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "approve" },
    });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      event: "acp.session.update",
      data: expect.objectContaining({ sessionId: "session_1" }),
    }));
  });

  it("waits for Kimi's delayed rawInput before evaluating the permission", async () => {
    const command = "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json";
    const client = createKimiAcpCollectingClient(
      vi.fn(),
      createAcpKimiPermissionHandler({
        actionKey: "lark-ticket-support-qa-summarize",
        executionPolicy: "shell",
        workspaceDir: "/srv/odoo/eu",
        octoServerDir: "/srv/octo/server",
        skillId: "support_qa_query",
        ticketNumber: "LT-10",
      }),
    );
    const toolCallId = "12:delayed";
    const permission = client.requestPermission(kimi038PermissionRequest(toolCallId));

    await client.sessionUpdate({
      sessionId: "session_1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        rawInput: { command },
        status: "in_progress",
      },
    } as SessionNotification);

    await expect(permission).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "approve" },
    });
  });

  it("keeps missing, cross-id, and conflicting Kimi 0.38 permission evidence denied", async () => {
    const command = "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json";
    const client = createKimiAcpCollectingClient(
      vi.fn(),
      createAcpKimiPermissionHandler({
        executionPolicy: "shell",
        workspaceDir: "/srv/odoo/eu",
        octoServerDir: "/srv/octo/server",
        skillId: "support_qa_query",
        ticketNumber: "LT-10",
      }),
    );

    await client.sessionUpdate({
      sessionId: "session_1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "12:tool_1",
        rawInput: { command },
      },
    } as SessionNotification);

    await expect(client.requestPermission(kimi038PermissionRequest("12:other"))).resolves.toEqual({
      outcome: { outcome: "cancelled" },
    });
    const conflicting = kimi038PermissionRequest("12:tool_1");
    await expect(client.requestPermission({
      ...conflicting,
      toolCall: {
        ...conflicting.toolCall,
        rawInput: {
          command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-11 --json",
        },
      },
    })).resolves.toEqual({ outcome: { outcome: "cancelled" } });
  });
});

function kimi038PermissionRequest(toolCallId: string): RequestPermissionRequest {
  return {
    sessionId: "session_1",
    options: [
      { optionId: "approve", name: "Approve once", kind: "allow_once" },
      { optionId: "approve_for_session", name: "Approve for this session", kind: "allow_always" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId,
      title: "Bash",
      content: [{
        type: "content",
        content: {
          type: "text",
          text: "Requesting approval to Running: bash .agents/skills/write-support-qa/scripts/write-…",
        },
      }],
    },
  } as RequestPermissionRequest;
}
