import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSupportAnalysisUpdatePath,
  createAcpKimiClientCapabilityPolicy,
  createAcpKimiPermissionHandler,
  extractAcpKimiExecuteCall,
  isAcpKimiSupportAnalysisUpdateExecuteCall,
  isAcpKimiSupportQaFetchExecuteCall,
} from "./acp-kimi-permission-policy.js";

function permissionRequest(input: { title: string; rawInput?: unknown }): RequestPermissionRequest {
  return {
    sessionId: "session_1",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
    toolCall: { toolCallId: "tool_1", title: input.title, rawInput: input.rawInput },
  } as RequestPermissionRequest;
}

describe("acp kimi permission policy", () => {
  it("temporarily approves opaque Bash only for a configured Support-QA Ticket action", async () => {
    const context = {
      actionKey: "lark-ticket-support-qa-summarize",
      executionPolicy: "write+shell" as const,
      workspaceDir: "/srv/odoo/eu",
      octoServerDir: "/srv/octo/server",
      skillProfile: "support_qa_eu",
      skillId: "support_qa_query",
      ticketNumber: "LT-10",
      ticketRecordId: "rec_1",
      actionRunId: "action_1",
    };
    const handler = createAcpKimiPermissionHandler(context);
    for (const title of ["Read", "Write", "mcp__octo_execute__execute", "Bash"]) {
      await expect(handler(permissionRequest({ title }))).resolves.toEqual({
        outcome: { outcome: "selected", optionId: "allow-once" },
      });
    }
    const unrelatedHandler = createAcpKimiPermissionHandler({
      ...context,
      actionKey: "unrelated-action",
    });
    await expect(unrelatedHandler(permissionRequest({ title: "Bash" }))).resolves.toEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("allows reads in both configured roots and writes only in the Support workspace", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "octo-acp-policy-"));
    const workspaceDir = join(testRoot, "support");
    const octoServerDir = join(testRoot, "server");
    const outsideDir = join(testRoot, "outside");
    await Promise.all([mkdir(workspaceDir), mkdir(octoServerDir), mkdir(outsideDir)]);
    const supportFile = join(workspaceDir, "support.md");
    const serverFile = join(octoServerDir, "server.ts");
    const outsideFile = join(outsideDir, "outside.txt");
    await Promise.all([
      writeFile(supportFile, "support"),
      writeFile(serverFile, "server"),
      writeFile(outsideFile, "outside"),
    ]);
    const policy = createAcpKimiClientCapabilityPolicy({
      executionPolicy: "write+shell",
      workspaceDir,
      octoServerDir,
    });

    try {
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: supportFile })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: serverFile })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: outsideFile })).resolves.toBe(false);
      await expect(policy.allowsWriteTextFile({ sessionId: "s", path: join(workspaceDir, "new.json"), content: "{}" })).resolves.toBe(true);
      await expect(policy.allowsWriteTextFile({ sessionId: "s", path: join(octoServerDir, "new.json"), content: "{}" })).resolves.toBe(false);
      await expect(policy.allowsWriteTextFile({ sessionId: "s", path: join(workspaceDir, ".env"), content: "secret" })).resolves.toBe(false);
      await expect(policy.allowsTerminal({ sessionId: "s", command: "bash", args: ["-c", "id"] })).resolves.toBe(false);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes for reads and writes", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "octo-acp-symlink-"));
    const workspaceDir = join(testRoot, "support");
    const outsideDir = join(testRoot, "outside");
    await Promise.all([mkdir(workspaceDir), mkdir(outsideDir)]);
    const outsideFile = join(outsideDir, "outside.txt");
    const link = join(workspaceDir, "linked.txt");
    await writeFile(outsideFile, "outside");
    await symlink(outsideFile, link);
    const policy = createAcpKimiClientCapabilityPolicy({
      executionPolicy: "write+shell",
      workspaceDir,
      octoServerDir: workspaceDir,
    });

    try {
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: link })).resolves.toBe(false);
      await expect(policy.allowsWriteTextFile({ sessionId: "s", path: link, content: "changed" })).resolves.toBe(false);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("recognizes only context-bound Support-QA execute payloads", () => {
    const context = {
      actionKey: "lark-ticket-support-qa-summarize",
      skillId: "support_qa_query",
      workspaceDir: "/srv/odoo/eu",
      ticketNumber: "LT-10",
      ticketRecordId: "rec_1",
      actionRunId: "action_1",
    };
    const analysisPath = buildSupportAnalysisUpdatePath(context)!;
    const fetch = extractAcpKimiExecuteCall({
      root: "support_workspace",
      script: ".agents/skills/write-support-qa/scripts/write-support-qa.sh",
      subcommand: "fetch",
      args: ["LT-10", "--json"],
    })!;
    const update = extractAcpKimiExecuteCall({ arguments: {
      root: "support_workspace",
      script: ".agents/skills/write-support-qa/scripts/write-support-qa.sh",
      subcommand: "analysis-update",
      args: [analysisPath, "--json"],
    } })!;

    expect(isAcpKimiSupportQaFetchExecuteCall(fetch, context)).toBe(true);
    expect(isAcpKimiSupportAnalysisUpdateExecuteCall(update, context)).toBe(true);
    expect(isAcpKimiSupportQaFetchExecuteCall({ ...fetch, args: ["LT-11", "--json"] }, context)).toBe(false);
  });
});
