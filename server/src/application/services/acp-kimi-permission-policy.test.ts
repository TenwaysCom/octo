import type { CreateTerminalRequest, RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createAcpKimiClientCapabilityPolicy,
  createAcpKimiPermissionHandler,
  ensureAcpKimiScratchDir,
  tryAutoApproveAcpHermesEdit,
  type AcpKimiPermissionContext,
} from "./acp-kimi-permission-policy.js";

const FETCH_SCRIPT = ".agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh";

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

function hermesEditRequest(input: {
  tool: "patch" | "write_file";
  path: string;
  oldText?: string | null;
  newText: string;
  arguments?: Record<string, unknown>;
}): RequestPermissionRequest {
  return {
    sessionId: "session_1",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "edit-approval-1",
      title: `Approve edit: ${input.path}`,
      kind: "edit",
      content: [{ type: "diff", path: input.path, oldText: input.oldText, newText: input.newText }],
      rawInput: {
        tool: input.tool,
        arguments: input.arguments ?? (input.tool === "write_file"
          ? { path: input.path, content: input.newText }
          : { path: input.path, mode: "replace", old_string: input.oldText, new_string: input.newText }),
      },
    },
  };
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
    join(workspaceDir, "docs/llm-wiki/concepts/faq"),
    join(workspaceDir, "docs/llm-wiki/concepts/cache-refresh"),
    join(workspaceDir, "docs/llm-wiki/raw/transcripts"),
    join(workspaceDir, "docs/llm-wiki/entities"),
    join(workspaceDir, "docs/llm-wiki/entities/group"),
    join(workspaceDir, "docs/llm-wiki/queries"),
    join(workspaceDir, "docs/llm-wiki/_meta"),
    outsideDir,
  ]) await mkdir(path, { recursive: true });
  await Promise.all([
    writeFile(join(workspaceDir, FETCH_SCRIPT), "#!/bin/bash\n"),
    writeFile(join(workspaceDir, "docs/llm-wiki/SCHEMA.md"), "schema"),
    writeFile(join(workspaceDir, "docs/llm-wiki/index.md"), "index"),
    writeFile(join(workspaceDir, "docs/llm-wiki/log.md"), "log"),
    writeFile(join(workspaceDir, "docs/llm-wiki/_meta/state.jsonl"), "{}\n"),
    writeFile(join(workspaceDir, "docs/llm-wiki/concepts/faq/example.md"), "faq"),
    writeFile(join(workspaceDir, "docs/llm-wiki/raw/transcripts/ticket-1001.md"), "raw"),
    writeFile(join(workspaceDir, "docs/llm-wiki/entities/odoo.md"), "entity"),
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

  it("limits Answer writes to scratch and Document writes to wiki knowledge targets", async () => {
    const fixture = await createFixture();
    try {
      const answer = createAcpKimiClientCapabilityPolicy(context(fixture));
      const document = createAcpKimiClientCapabilityPolicy(context(fixture, "support-qa.document.v1"));
      const scratchFile = join(fixture.scratchDir, "effect-draft.json");
      const card = join(fixture.workspaceDir, "docs/llm-wiki/concepts/cache-refresh/x.md");
      const faq = join(fixture.workspaceDir, "docs/llm-wiki/concepts/faq/example.md");
      const raw = join(fixture.workspaceDir, "docs/llm-wiki/raw/transcripts/ticket-1001.md");
      const entity = join(fixture.workspaceDir, "docs/llm-wiki/entities/odoo.md");
      const entityNested = join(fixture.workspaceDir, "docs/llm-wiki/entities/group/odoo.md");
      const state = join(fixture.workspaceDir, "docs/llm-wiki/_meta/state.jsonl");
      const wikiIndex = join(fixture.workspaceDir, "docs/llm-wiki/index.md");

      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "{}" })).resolves.toBe(true);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: card, content: "x" })).resolves.toBe(false);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/queries/2026-09-11-vpn.md"), content: "x" })).resolves.toBe(true);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/log.md"), content: "x" })).resolves.toBe(true);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/queries/nested/x.md"), content: "x" })).resolves.toBe(false);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/index.md"), content: "x" })).resolves.toBe(false);
      await expect(answer.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/_meta/state.jsonl"), content: "{}" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: card, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: faq, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: raw, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: entity, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: entityNested, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: state, content: "{}\n" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: wikiIndex, content: "x" })).resolves.toBe(true);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: `${fixture.workspaceDir}/docs/llm-wiki/../llm-wiki-escape.md`, content: "x" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/SCHEMA.md"), content: "x" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/_meta/other.jsonl"), content: "x" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/knowledge-index.jsonl"), content: "{}" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.scratchDir, "missing", "x.json"), content: "{}" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: join(fixture.scratchDir, ".env.local"), content: "secret" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "bad\0text" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "\ud800" })).resolves.toBe(false);
      await expect(document.allowsWriteTextFile({ sessionId: "s", path: scratchFile, content: "x".repeat(256 * 1024 + 1) })).resolves.toBe(false);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("allows reading the wiki knowledge base and rejects traversal and symlink escapes", async () => {
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
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/SCHEMA.md") })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/index.md") })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/_meta/state.jsonl") })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: join(fixture.workspaceDir, "docs/llm-wiki/concepts/faq/example.md") })).resolves.toBe(true);
      await expect(policy.allowsReadTextFile({ sessionId: "s", path: outsideFile })).resolves.toBe(false);
      const linkedRootPolicy = createAcpKimiClientCapabilityPolicy({ ...context(fixture), scratchDir: scratchLink });
      await expect(linkedRootPolicy.allowsWriteTextFile({ sessionId: "s", path: join(scratchLink, "escape.json"), content: "{}" })).resolves.toBe(false);
      await expect(policy.authorizeTerminal(terminalRequest("git", ["status", "--short"], workspaceLink))).resolves.toBeUndefined();
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("auto-approves only structured Hermes write_file and replace patches accepted by the write policy", async () => {
    const fixture = await createFixture();
    try {
      const document = context(fixture, "support-qa.document.v1");
      const entity = join(fixture.workspaceDir, "docs/llm-wiki/entities/odoo.md");
      const newConcept = join(fixture.workspaceDir, "docs/llm-wiki/concepts/new.md");

      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "patch", path: entity, oldText: "entity", newText: "updated entity",
      }), document)).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "write_file", path: newConcept, oldText: null, newText: "new concept",
      }), document)).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });

      const answer = context(fixture);
      const query = join(fixture.workspaceDir, "docs/llm-wiki/queries/2026-09-11-vpn.md");
      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "write_file", path: query, oldText: null, newText: "query",
      }), answer)).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("leaves unsafe, stale or unverifiable Hermes edits for normal approval", async () => {
    const fixture = await createFixture();
    try {
      const document = context(fixture, "support-qa.document.v1");
      const entity = join(fixture.workspaceDir, "docs/llm-wiki/entities/odoo.md");
      const outside = join(fixture.outsideDir, "outside.md");
      const safePatch = hermesEditRequest({ tool: "patch", path: entity, oldText: "entity", newText: "updated" });

      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "patch", path: entity, oldText: "entity", newText: "displayed",
        arguments: { path: entity, old_string: "entity", new_string: "different" },
      }), document)).resolves.toBeUndefined();
      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "patch", path: outside, oldText: "outside", newText: "changed",
      }), document)).resolves.toBeUndefined();
      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "patch", path: entity, oldText: "stale", newText: "changed",
      }), document)).resolves.toBeUndefined();
      await expect(tryAutoApproveAcpHermesEdit({
        ...safePatch,
        toolCall: { ...safePatch.toolCall, content: [{ type: "diff", path: outside, oldText: "entity", newText: "updated" }] },
      }, document)).resolves.toBeUndefined();
      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "write_file",
        path: entity,
        oldText: "entity",
        newText: "displayed",
        arguments: { path: entity, content: "different" },
      }), document)).resolves.toBeUndefined();
      await expect(tryAutoApproveAcpHermesEdit(hermesEditRequest({
        tool: "patch",
        path: entity,
        oldText: "entity",
        newText: "*** Begin Patch\n*** Update File: entity\n*** End Patch",
        arguments: { mode: "patch", patch: "*** Begin Patch\n*** Update File: entity\n*** End Patch" },
      }), document)).resolves.toBeUndefined();
      await expect(tryAutoApproveAcpHermesEdit({
        ...safePatch,
        options: [{ optionId: "deny", name: "Deny", kind: "reject_once" }],
      }, document)).resolves.toBeUndefined();
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("matches only read-only evidence terminal argv and rejects shell injection and v1 write commands", async () => {
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
      await expect(answer.authorizeTerminal(terminalRequest("/bin/bash", ["-lc", `bash ${FETCH_SCRIPT} fetch-record rec_1 --json`], fixture.workspaceDir))).resolves.toMatchObject({
        ruleId: "support_qa.fetch_record",
      });
      await expect(answer.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "fetch", "TEN-11", "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
      for (const command of [`${fetch}; id`, `${fetch} | cat`, `${fetch} > /tmp/x`, "curl https://example.com", "lark-cli record-upsert", "id"]) {
        await expect(answer.authorizeTerminal(terminalRequest("/bin/bash", ["-lc", command], fixture.workspaceDir))).resolves.toBeUndefined();
      }
      await expect(answer.authorizeTerminal({ ...terminalRequest("bash", [FETCH_SCRIPT, "fetch", "TEN-10", "--json"], fixture.workspaceDir), env: [{ name: "TOKEN", value: "x" }] })).resolves.toBeUndefined();
      await expect(answer.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "fetch", "TEN-10", "--json"], fixture.outsideDir))).resolves.toBeUndefined();

      const updateFile = join(fixture.scratchDir, "update.json");
      await writeFile(updateFile, "{}");
      // v1 write paths are gone: update / analysis-update / eval are never authorized
      await expect(document.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "update", updateFile, "--dry-run", "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
      await expect(document.authorizeTerminal(terminalRequest("bash", [FETCH_SCRIPT, "update", updateFile, "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
      await expect(document.authorizeTerminal(terminalRequest("node", [".agents/skills/eval-support-qa/scripts/eval-support-qa.mjs", "--ticket-no", "TEN-10", "--qa-card-path", "docs/llm-wiki/concepts/x.md", "--json"], fixture.workspaceDir))).resolves.toBeUndefined();
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
