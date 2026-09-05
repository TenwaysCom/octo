import type { CreateTerminalRequest, RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createAcpKimiClientCapabilityPolicy,
  createAcpKimiPermissionHandler,
  ensureAcpKimiScratchDir,
  type AcpKimiPermissionContext,
} from "./acp-kimi-permission-policy.js";

const FETCH_SCRIPT = ".agents/skills/write-support-qa/scripts/write-support-qa.sh";
const EVAL_SCRIPT = ".agents/skills/eval-support-qa/scripts/eval-support-qa.mjs";

function permissionRequest(title: string): RequestPermissionRequest {
  return {
    sessionId: "session_1",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
    toolCall: { toolCallId: "tool_1", title },
  } as RequestPermissionRequest;
}

function terminalRequest(command: string, args: string[] = [], cwd?: string): CreateTerminalRequest {
  return { sessionId: "session_1", command, args, ...(cwd ? { cwd } : {}) };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "octo-acp-policy-"));
  const workspaceDir = join(root, "support");
  const actionRunId = `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scratchDir = await ensureAcpKimiScratchDir(actionRunId);
  const outsideDir = join(root, "outside");
  for (const path of [
    join(workspaceDir, dirname(FETCH_SCRIPT)),
    join(workspaceDir, dirname(EVAL_SCRIPT)),
    join(workspaceDir, "docs/support-qa/qa-cards"),
    join(workspaceDir, "docs/support-qa/indexes"),
    outsideDir,
  ]) await mkdir(path, { recursive: true });
  await Promise.all([
    writeFile(join(workspaceDir, FETCH_SCRIPT), "#!/bin/bash\n"),
    writeFile(join(workspaceDir, EVAL_SCRIPT), ""),
    writeFile(join(workspaceDir, "docs/support-qa/faq.md"), "faq"),
    writeFile(join(workspaceDir, "docs/support-qa/qa-cards/TEN-10.md"), "card"),
    writeFile(join(outsideDir, "outside.md"), "outside"),
  ]);
  return { root, workspaceDir, scratchDir, outsideDir, actionRunId };
}

function context(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  profile: "support-qa.answer.v1" | "support-qa.document.v1" = "support-qa.answer.v1",
): AcpKimiPermissionContext {
  return {
    actionKey: profile === "support-qa.answer.v1"
      ? "lark-ticket-support-qa-answer"
      : "lark-ticket-support-qa-document-preview",
    permissionProfileId: profile,
    permissionProfileVersion: "1",
    workspaceDir: fixture.workspaceDir,
    scratchDir: fixture.scratchDir,
    ticketNumber: "TEN-10",
    ticketRecordId: "rec_1",
    actionRunId: fixture.actionRunId,
  };
}

describe("acp kimi permission policy", () => {
  it("approves capability names only for an exact versioned profile and never approves MCP", async () => {
    const fixture = await createFixture();
    try {
      const handler = createAcpKimiPermissionHandler(context(fixture));
      for (const title of ["Read", "Write", "Bash"]) {
        await expect(handler(permissionRequest(title))).resolves.toEqual({
          outcome: { outcome: "selected", optionId: "allow-once" },
        });
      }
      await expect(handler(permissionRequest("mcp__octo_execute__execute"))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
      const chat = createAcpKimiClientCapabilityPolicy({
        actionKey: "acp.chat",
        permissionProfileId: "acp.chat-readonly.v1",
        permissionProfileVersion: "1",
      });
      expect(chat).toMatchObject({ canReadTextFile: false, canWriteTextFile: false, canUseTerminal: false });
      for (const override of [
        { permissionProfileVersion: "999" },
        { actionKey: "lark-ticket-support-qa-document-preview" },
        { permissionProfileId: null, legacySession: true },
      ]) {
        const denied = createAcpKimiPermissionHandler({ ...context(fixture), ...override } as AcpKimiPermissionContext);
        await expect(denied(permissionRequest("Bash"))).resolves.toEqual({ outcome: { outcome: "cancelled" } });
      }
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("limits Answer writes to scratch and Document writes to named markdown targets", async () => {
    const fixture = await createFixture();
    try {
      const answer = createAcpKimiClientCapabilityPolicy(context(fixture));
      const document = createAcpKimiClientCapabilityPolicy(context(fixture, "support-qa.document.v1"));
      const scratchFile = join(fixture.scratchDir, "effect-draft.json");
      const card = join(fixture.workspaceDir, "docs/support-qa/qa-cards/TEN-10.md");
      const index = join(fixture.workspaceDir, "docs/support-qa/indexes/products.md");

      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "{}" })).resolves.toBe(true);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: card, content: "x" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: card, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: index, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/support-qa/knowledge-index.jsonl"), content: "{}" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.scratchDir, "missing", "x.json"), content: "{}" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.scratchDir, ".env.local"), content: "secret" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "bad\0text" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "\ud800" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "x".repeat(256 * 1024 + 1) })).resolves.toBe(false);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rejects traversal and symlink escapes for reads and writes", async () => {
    const fixture = await createFixture();
    try {
      const outsideFile = join(fixture.outsideDir, "outside.md");
      const link = join(fixture.scratchDir, "linked.md");
      const scratchLink = join(fixture.root, "linked-scratch");
      const workspaceLink = join(fixture.root, "linked-workspace");
      await symlink(outsideFile, link);
      await symlink(fixture.outsideDir, scratchLink);
      await symlink(fixture.workspaceDir, workspaceLink);
      const policy = createAcpKimiClientCapabilityPolicy(context(fixture, "support-qa.document.v1"));
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: link })).resolves.toBe(false);
      await expect(policy.allowsWriteTextFile({ sessionId: "s", path: link, content: "changed" })).resolves.toBe(false);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/support-qa/qa-cards/TEN-10.md") })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: outsideFile })).resolves.toBe(false);
      const linkedRootPolicy = createAcpKimiClientCapabilityPolicy({ ...context(fixture), scratchDir: scratchLink });
      await expect(linkedRootPolicy.allowsWriteTextFile({ sessionId: "s", path: join(scratchLink, "escape.json"), content: "{}" })).resolves.toBe(false);
      await expect(policy.authorizeTerminal(terminalRequest("git", ["status", "--short"], workspaceLink))).resolves.toBeUndefined();
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("matches only context-bound terminal argv and rejects shell injection and external effects", async () => {
    const fixture = await createFixture();
    try {
      const answer = createAcpKimiClientCapabilityPolicy(context(fixture));
      const document = createAcpKimiClientCapabilityPolicy(context(fixture, "support-qa.document.v1"));
      const fetch = `bash ${FETCH_SCRIPT} fetch TEN-10 --json`;
      await expect(answer.authorizeTerminal(terminalRequest("/bin/bash", ["-lc", fetch], fixture.workspaceDir))).resolves.toMatchObject({
        ruleId: "support_qa.fetch",
        args: expect.arrayContaining(["fetch", "TEN-10", "--json"]),
        env: { OCTO_SUPPORT_QA_ACTION_DIR: fixture.scratchDir },
      });
      await expect(answer.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "fetch", "TEN-11", "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
      for (const command of [`${fetch}; id`, `${fetch} | cat`, `${fetch} > /tmp/x`, "curl https://example.com", "lark-cli record-upsert", "id"]) {
        await expect(answer.authorizeTerminal(terminalRequest("/bin/bash", ["-lc", command], fixture.workspaceDir))).resolves.toBeUndefined();
      }
      await expect(answer.authorizeTerminal({ ...terminalRequest("bash", [FETCH_SCRIPT, "fetch", "TEN-10", "--json"], fixture.workspaceDir), env: [{ name: "TOKEN", value: "x" }] })).resolves.toBeUndefined();
      await expect(answer.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "fetch", "TEN-10", "--json"], fixture.outsideDir))).resolves.toBeUndefined();

      const updateFile = join(fixture.scratchDir, "update.json");
      await writeFile(updateFile, "{}");
      await expect(document.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "update", updateFile, "--dry-run", "--json"], fixture.workspaceDir))).resolves.toMatchObject({ ruleId: "support_qa.update_dry_run" });
      await expect(document.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "update", updateFile, "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
      await expect(document.authorizeTerminal(terminalRequest("node", [EVAL_SCRIPT, "--ticket-no", "TEN-10", "--qa-card-path", "docs/support-qa/qa-cards/TEN-10.md", "--json"], fixture.workspaceDir))).resolves.toMatchObject({ ruleId: "support_qa.eval" });
      await expect(document.authorizeTerminal(terminalRequest("node", [EVAL_SCRIPT, "--ticket-no", "TEN-10", "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
      await expect(document.authorizeTerminal(terminalRequest("node", [EVAL_SCRIPT, "--ticket-no", "TEN-10", "--writeback"], fixture.workspaceDir))).resolves.toBeUndefined();
      await expect(document.authorizeTerminal(terminalRequest("node", [EVAL_SCRIPT, "--ticket-no", "TEN-10", "--allow-external-ai"], fixture.workspaceDir))).resolves.toBeUndefined();
    } finally {
      await cleanupFixture(fixture);
    }
  });
});

async function cleanupFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await Promise.all([
    rm(fixture.root, { recursive: true, force: true }),
    rm(fixture.scratchDir, { recursive: true, force: true }),
  ]);
}
