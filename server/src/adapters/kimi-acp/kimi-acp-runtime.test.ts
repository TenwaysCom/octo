import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  KIMI_ACP_MCP_SERVERS,
  KimiAcpRuntimeError,
  createKimiAcpCollectingClient,
  createKimiAcpSessionRuntime,
  type KimiAcpConnection,
} from "./kimi-acp-runtime.js";
import {
  createAcpKimiClientCapabilityPolicy,
  ensureAcpKimiScratchDir,
  type AcpKimiClientCapabilityPolicy,
} from "../../application/services/acp-kimi-permission-policy.js";
import { createInMemoryAcpKimiOperationAuditStore } from "../../application/services/acp-kimi-operation-audit.js";

const FETCH_SCRIPT = ".agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh";

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
      env: { ...process.env, KIMI_ACP_STARTUP_TIMEOUT_MS: "25" },
      createConnection: () => connection,
    });
    const expectation = expect(runtimePromise).rejects.toMatchObject({
      name: "AcpRuntimeError",
      code: "ACP_INITIALIZE_TIMEOUT",
      stage: "adapter.acp.initialize",
    } satisfies Partial<KimiAcpRuntimeError>);
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps MCP servers empty for every new ACP session", () => {
    expect(KIMI_ACP_MCP_SERVERS).toEqual([]);
  });

  it("executes an allowed Terminal command with shell:false and records its real exit", async () => {
    const fixture = await createTerminalFixture("printf 'ticket:%s\\nscratch:%s\\n' \"$2\" \"$OCTO_SUPPORT_QA_ACTION_DIR\"\n");
    const auditStore = createInMemoryAcpKimiOperationAuditStore();
    const policy = createAcpKimiClientCapabilityPolicy(fixture.context, auditStore);
    const client = createKimiAcpCollectingClient(vi.fn(), undefined, policy);
    try {
      const created = await client.createTerminal({
        sessionId: "session_1",
        command: "/bin/bash",
        args: ["-lc", `bash ${FETCH_SCRIPT} fetch TEN-10 --json`],
        cwd: fixture.workspaceDir,
      });
      await expect(client.waitForTerminalExit({ sessionId: "session_1", terminalId: created.terminalId })).resolves.toEqual({ exitCode: 0, signal: null });
      await expect(client.terminalOutput({ sessionId: "session_1", terminalId: created.terminalId })).resolves.toMatchObject({
        output: `ticket:TEN-10\nscratch:${fixture.scratchDir}\n`,
        truncated: false,
        exitStatus: { exitCode: 0, signal: null },
      });
      expect(auditStore.get({ sessionId: "session_1", actionRunId: fixture.context.actionRunId, ruleId: "support_qa.fetch" })).toMatchObject({ status: "completed", exitCode: 0 });
      await client.releaseTerminal({ sessionId: "session_1", terminalId: created.terminalId });
    } finally {
      await client.close();
      await Promise.all([
        rm(fixture.root, { recursive: true, force: true }),
        rm(fixture.scratchDir, { recursive: true, force: true }),
      ]);
    }
  });

  it("enforces output limits, non-zero errors, one active process, and disconnect cleanup", async () => {
    const audits: Array<Record<string, unknown>> = [];
    const policy = fixedPolicy({
      executable: "/bin/sh",
      args: ["-c", "printf '0123456789'; sleep 5; exit 7"],
      outputByteLimit: 5,
      timeoutMs: 60_000,
      record: (entry) => audits.push(entry),
    });
    const client = createKimiAcpCollectingClient(vi.fn(), undefined, policy);
    const first = await client.createTerminal({ sessionId: "session_1", command: "approved" });
    await expect(client.createTerminal({ sessionId: "session_1", command: "approved" })).rejects.toThrow("ACP_TERMINAL_BUSY");
    let output = await client.terminalOutput({ sessionId: "session_1", terminalId: first.terminalId });
    for (let attempt = 0; attempt < 20 && !output.output; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      output = await client.terminalOutput({ sessionId: "session_1", terminalId: first.terminalId });
    }
    expect(output).toMatchObject({ output: "56789", truncated: true });
    await client.close();
    expect(audits).toEqual(expect.arrayContaining([expect.objectContaining({ status: "started" }), expect.objectContaining({ status: "failed" })]));
  });

  it("returns stable timeout and non-zero exit errors", async () => {
    const timeoutClient = createKimiAcpCollectingClient(vi.fn(), undefined, fixedPolicy({
      executable: "/bin/sleep",
      args: ["5"],
      timeoutMs: 20,
    }));
    const timed = await timeoutClient.createTerminal({ sessionId: "s", command: "approved" });
    await expect(timeoutClient.waitForTerminalExit({ sessionId: "s", terminalId: timed.terminalId })).rejects.toThrow("ACP_TERMINAL_TIMEOUT");
    await timeoutClient.close();

    const failedClient = createKimiAcpCollectingClient(vi.fn(), undefined, fixedPolicy({
      executable: "/usr/bin/false",
      args: [],
    }));
    const failed = await failedClient.createTerminal({ sessionId: "s", command: "approved" });
    await expect(failedClient.waitForTerminalExit({ sessionId: "s", terminalId: failed.terminalId })).rejects.toThrow("ACP_TERMINAL_NONZERO_EXIT");
    await failedClient.close();
  });

  it("kills and releases a running terminal and requires a new action session for legacy writes", async () => {
    const client = createKimiAcpCollectingClient(vi.fn(), undefined, fixedPolicy({
      executable: "/bin/sleep",
      args: ["5"],
    }));
    const running = await client.createTerminal({ sessionId: "s", command: "approved" });
    await expect(client.killTerminal({ sessionId: "s", terminalId: running.terminalId })).resolves.toEqual({});
    await expect(client.waitForTerminalExit({ sessionId: "s", terminalId: running.terminalId })).rejects.toThrow("ACP_TERMINAL_NONZERO_EXIT");
    await expect(client.releaseTerminal({ sessionId: "s", terminalId: running.terminalId })).resolves.toEqual({});

    const legacy = createKimiAcpCollectingClient(vi.fn(), undefined, {
      ...fixedPolicy({ executable: "/usr/bin/true", args: [] }),
      permissionUpgradeRequired: true,
    });
    await expect(legacy.writeTextFile({ sessionId: "s", path: "/tmp/never", content: "x" })).rejects.toThrow("ACP_SESSION_PERMISSION_UPGRADE_REQUIRED");
    await expect(legacy.createTerminal({ sessionId: "s", command: "approved" })).rejects.toThrow("ACP_SESSION_PERMISSION_UPGRADE_REQUIRED");
    await legacy.close();
  });

  it("writes allowed text files with mode 0600", async () => {
    const fixture = await createTerminalFixture("");
    const policy = createAcpKimiClientCapabilityPolicy(fixture.context);
    const client = createKimiAcpCollectingClient(vi.fn(), undefined, policy);
    const path = join(fixture.scratchDir, "draft.json");
    try {
      await client.writeTextFile({ sessionId: "session_1", path, content: "{}" });
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await client.close();
      await Promise.all([
        rm(fixture.root, { recursive: true, force: true }),
        rm(fixture.scratchDir, { recursive: true, force: true }),
      ]);
    }
  });
});

async function createTerminalFixture(scriptBody: string) {
  const root = await mkdtemp(join(tmpdir(), "octo-acp-runtime-"));
  const workspaceDir = join(root, "workspace");
  const actionRunId = `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scratchDir = await ensureAcpKimiScratchDir(actionRunId);
  const scriptPath = join(workspaceDir, FETCH_SCRIPT);
  await mkdir(dirname(scriptPath), { recursive: true });
  await writeFile(scriptPath, `#!/bin/bash\n${scriptBody}`);
  return {
    root,
    workspaceDir,
    scratchDir,
    context: {
      actionKey: "lark-ticket-support-qa-answer",
      permissionProfileId: "support-qa.answer.v1" as const,
      permissionProfileVersion: "1",
      workspaceDir,
      scratchDir,
      ticketNumber: "TEN-10",
      actionRunId,
    },
  };
}

function fixedPolicy(input: {
  executable: string;
  args: string[];
  timeoutMs?: number;
  outputByteLimit?: number;
  record?: (entry: Record<string, unknown>) => void;
}): AcpKimiClientCapabilityPolicy {
  return {
    canReadTextFile: false,
    canWriteTextFile: false,
    canUseTerminal: true,
    permissionUpgradeRequired: false,
    authorizeTerminal: async () => ({
      executable: input.executable,
      args: input.args,
      cwd: process.cwd(),
      env: {},
      ruleId: "test.rule",
      timeoutMs: input.timeoutMs ?? 60_000,
      outputByteLimit: input.outputByteLimit ?? 256 * 1024,
    }),
    allowsReadTextFile: async () => false,
    allowsWriteTextFile: async () => false,
    recordTerminalAudit: (entry) => input.record?.(entry),
  };
}
