import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { createAcpKimiPermissionHandler } from "./acp-kimi-permission-policy.js";

function permissionRequest(input: {
  title?: string;
  rawInput?: unknown;
} = {}): RequestPermissionRequest {
  return {
    sessionId: "session_1",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "tool_1",
      title: input.title ?? "Bash",
      rawInput: input.rawInput ?? {
        command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json",
      },
    },
  } as RequestPermissionRequest;
}

describe("acp kimi permission policy", () => {
  const shellContext = {
    actionKey: "lark-ticket-support-qa-summarize",
    executionPolicy: "shell" as const,
    workspaceDir: "/srv/odoo/eu",
    skillProfile: "support_qa_eu",
    skillId: "support_qa_query",
    ticketNumber: "LT-10",
    policyVersion: "v1",
  };

  it("allows only the configured Ticket fetch command once for shell policy", async () => {
    const handler = createAcpKimiPermissionHandler(shellContext);

    await expect(handler(permissionRequest())).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    });
    await expect(handler(permissionRequest({
      rawInput: { command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-11 --json" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json; pwd" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("allows only Support-QA document writes for write+shell policy", async () => {
    const handler = createAcpKimiPermissionHandler({
      ...shellContext,
      executionPolicy: "write+shell",
      skillId: "support_qa_write",
    });

    await expect(handler(permissionRequest({
      title: "Write",
      rawInput: { path: "docs/support-qa/qa-cards/LT-10.md", content: "draft" },
    }))).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    });
    await expect(handler(permissionRequest({
      title: "Write",
      rawInput: { path: "../../.ssh/config", content: "draft" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("keeps read_only, full, and missing contexts fail-closed", async () => {
    await expect(createAcpKimiPermissionHandler({
      ...shellContext,
      executionPolicy: "read_only",
    })(permissionRequest())).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(createAcpKimiPermissionHandler({
      ...shellContext,
      executionPolicy: "full",
    })(permissionRequest())).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(createAcpKimiPermissionHandler(undefined)(permissionRequest())).resolves.toEqual({ outcome: { outcome: "cancelled" } });
  });
});
