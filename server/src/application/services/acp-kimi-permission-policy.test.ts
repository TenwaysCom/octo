import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSupportAnalysisUpdatePath,
  createAcpKimiPermissionHandler,
} from "./acp-kimi-permission-policy.js";

function permissionRequest(input: {
  title?: string;
  rawInput?: unknown;
  content?: RequestPermissionRequest["toolCall"]["content"];
  options?: RequestPermissionRequest["options"];
} = {}): RequestPermissionRequest {
  const rawInput = Object.prototype.hasOwnProperty.call(input, "rawInput")
    ? input.rawInput
    : {
        command: "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json",
      };
  return {
    sessionId: "session_1",
    options: input.options ?? [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "tool_1",
      title: input.title ?? "Bash",
      rawInput,
      ...(input.content ? { content: input.content } : {}),
    },
  } as RequestPermissionRequest;
}

function kimiCommandPermissionRequest(command: string): RequestPermissionRequest {
  return permissionRequest({
    title: "Shell: write-support-qa.sh",
    rawInput: null,
    content: [{
      type: "content",
      content: {
        type: "text",
        text: `Requesting approval to perform: Run command \`${command}\``,
      },
    }],
    options: [
      { optionId: "approve", name: "Approve once", kind: "allow_once" },
      { optionId: "approve_for_session", name: "Approve for this session", kind: "allow_always" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
  });
}

describe("acp kimi permission policy", () => {
  const shellContext = {
    actionKey: "lark-ticket-support-qa-summarize",
    executionPolicy: "shell" as const,
    workspaceDir: "/srv/odoo/eu",
    skillProfile: "support_qa_eu",
    skillId: "support_qa_query",
    ticketNumber: "LT-10",
    ticketRecordId: "rec_1",
    actionRunId: "action_1",
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

  it("reads the command from the real Kimi ACP permission content shape", async () => {
    const handler = createAcpKimiPermissionHandler(shellContext);
    const command = "bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json";

    await expect(handler(kimiCommandPermissionRequest(command))).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "approve" },
    });
    await expect(handler(kimiCommandPermissionRequest(`${command}; pwd`))).resolves.toEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("allows path-scoped ls and quoted grep while rejecting unsafe variants", async () => {
    const handler = createAcpKimiPermissionHandler(shellContext);

    await expect(handler(permissionRequest({
      rawInput: { command: "ls docs/support-qa/" },
    }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "grep '\"ticket_no\":\"LT-10\"' docs/support-qa/knowledge-index.jsonl" },
    }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "grep -E 'Return in transit|Customer Return' docs/support-qa/knowledge-index.jsonl" },
    }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "rg 'ticket_no' docs/support-qa/knowledge-index.jsonl" },
    }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });

    await expect(handler(permissionRequest({
      rawInput: { command: "ls /etc" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "ls docs/support-qa-private/" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "grep 'root' /etc/passwd" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "grep -r 'ticket_no' docs/support-qa/" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "grep 'ticket_no' docs/support-qa/knowledge-index.jsonl | cat" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "grep \"$(id)\" docs/support-qa/knowledge-index.jsonl" },
    }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(handler(permissionRequest({
      rawInput: { command: "rg --pre 'cat /etc/passwd' 'root' docs/support-qa/knowledge-index.jsonl" },
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

  it("allows only direct, regular JSON files in the Support-QA temp directory", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "octo-acp-permission-"));
    const supportQaTempDir = join(testRoot, "support-qa");
    await mkdir(supportQaTempDir);
    const updatePath = join(supportQaTempDir, "support-qa-LT-10-update.json");
    const symlinkPath = join(supportQaTempDir, "linked-update.json");
    const outsidePath = join(testRoot, "outside.json");
    await writeFile(outsidePath, "{}\n");
    await symlink(outsidePath, symlinkPath);

    try {
      const handler = createAcpKimiPermissionHandler({
        ...shellContext,
        executionPolicy: "write+shell",
        skillId: "support_qa_write",
      }, { supportQaTempDir });

      await expect(handler(permissionRequest({
        title: "WriteFile: support-qa-LT-10-update.json",
        rawInput: null,
        content: [{ type: "diff", path: updatePath, oldText: "", newText: "{}" }],
      }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
      await expect(handler(permissionRequest({
        title: "Write",
        rawInput: { path: join(supportQaTempDir, "update.txt"), content: "{}" },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
      await expect(handler(permissionRequest({
        title: "Write",
        rawInput: { path: join(supportQaTempDir, "nested", "update.json"), content: "{}" },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
      await expect(handler(permissionRequest({
        title: "Write",
        rawInput: { path: symlinkPath, content: "{}" },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });

      await writeFile(updatePath, "{}\n");
      await expect(handler(permissionRequest({
        rawInput: { command: `cat ${updatePath}` },
      }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
      await expect(handler(permissionRequest({
        title: "Shell",
        rawInput: null,
        content: [{
          type: "content",
          content: {
            type: "text",
            text: `Requesting approval to perform: Run command \`bash .agents/skills/write-support-qa/scripts/write-support-qa.sh update ${updatePath} --dry-run --json\``,
          },
        }],
      }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
      await expect(handler(permissionRequest({
        rawInput: { command: `bash .agents/skills/write-support-qa/scripts/write-support-qa.sh update ${symlinkPath} --json` },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
      await expect(handler(permissionRequest({
        rawInput: { command: `bash .agents/skills/write-support-qa/scripts/write-support-qa.sh update ${outsidePath} --json` },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("allows Summary to write and submit only its exact signed analysis payload", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "octo-acp-analysis-permission-"));
    const supportQaTempDir = join(testRoot, "support-qa");
    await mkdir(supportQaTempDir);
    const context = { ...shellContext, executionPolicy: "write+shell" as const };
    const updatePath = buildSupportAnalysisUpdatePath(context, supportQaTempDir)!;
    const otherPath = join(supportQaTempDir, "support-analysis-other.json");
    const handler = createAcpKimiPermissionHandler(context, { supportQaTempDir });

    try {
      await expect(handler(permissionRequest({
        title: "Write",
        rawInput: { path: updatePath, content: "{}" },
      }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
      await expect(handler(permissionRequest({
        title: "Write",
        rawInput: { path: "docs/support-qa/qa-cards/LT-10.md", content: "draft" },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
      await expect(handler(permissionRequest({
        title: "Write",
        rawInput: { path: otherPath, content: "{}" },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });

      await writeFile(updatePath, "{}\n");
      await expect(handler(permissionRequest({
        rawInput: { command: `bash .agents/skills/write-support-qa/scripts/write-support-qa.sh analysis-update ${updatePath} --json` },
      }))).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
      await expect(handler(permissionRequest({
        rawInput: { command: `bash .agents/skills/write-support-qa/scripts/write-support-qa.sh analysis-update ${otherPath} --json` },
      }))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
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
